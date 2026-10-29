import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { DeleteUnusedMediaDto } from '@gitroom/nestjs-libraries/dtos/media/delete.unused.media.dto';
import { GetMediaDto } from '@gitroom/nestjs-libraries/dtos/media/get.media.dto';
import { mediaUsage } from '@gitroom/nestjs-libraries/database/prisma/media/media.usage';
import {
  CreateMediaFolderDto,
  UpdateMediaFolderDto,
} from '@gitroom/nestjs-libraries/dtos/media/media.folder.dto';

/** Files named so are an operator's raw material, kept until someone deletes them by hand. */
export const RAW_PREFIX = 'raw-';

@Injectable()
export class MediaRepository {
  constructor(
    private _media: PrismaRepository<'media'>,
    private _post: PrismaRepository<'post'>,
    private _sets: PrismaRepository<'sets'>,
    private _signatures: PrismaRepository<'signatures'>,
    private _folders: PrismaRepository<'mediaFolder'>
  ) {}

  saveFile(org: string, fileName: string, filePath: string, originalName?: string) {
    return this._media.model.media.create({
      data: {
        organization: {
          connect: {
            id: org,
          },
        },
        name: fileName,
        path: filePath,
        originalName: originalName || null,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        status: true,
      },
    });
  }

  startProcessing(org: string, id: string) {
    return this._media.model.media.update({
      where: { id, organizationId: org },
      data: { status: 'processing', processingError: null },
      select: { id: true, status: true },
    });
  }

  finishProcessing(
    org: string,
    id: string,
    data: { name?: string; path?: string; fileSize?: number; error?: string }
  ) {
    return this._media.model.media.update({
      where: { id, organizationId: org },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.path ? { path: data.path } : {}),
        ...(data.fileSize ? { fileSize: data.fileSize } : {}),
        status: data.error ? 'failed' : 'ready',
        processingError: data.error || null,
      },
      select: { id: true, status: true },
    });
  }

  getMediaStatus(org: string, id: string) {
    return this._media.model.media.findFirst({
      where: {
        id,
        organizationId: org,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        status: true,
        processingError: true,
      },
    });
  }

  getMediaById(id: string) {
    return this._media.model.media.findUnique({
      where: {
        id,
      },
    });
  }

  deleteMedia(org: string, id: string) {
    return this._media.model.media.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._media.model.media.update({
      where: {
        id: data.id,
        organizationId: org,
      },
      data: {
        alt: data.alt,
        thumbnail: data.thumbnail,
        thumbnailTimestamp: data.thumbnailTimestamp,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        alt: true,
        thumbnail: true,
        path: true,
        thumbnailTimestamp: true,
      },
    });
  }

  // sparse: reads every post's media of the org per call; index the references
  // if an org's calendar grows into the tens of thousands
  private async usage(org: string) {
    const [files, posts, sets, signatures] = await Promise.all([
      this._media.model.media.findMany({
        where: { organizationId: org, deletedAt: null },
        select: {
          id: true,
          path: true,
          _count: {
            select: { userPicture: true, agencies: true, oauthApps: true },
          },
        },
      }),
      this._post.model.post.findMany({
        where: { organizationId: org, deletedAt: null, image: { not: null } },
        select: {
          id: true,
          group: true,
          publishDate: true,
          state: true,
          image: true,
        },
        orderBy: { publishDate: 'asc' },
      }),
      this._sets.model.sets.findMany({
        where: { organizationId: org },
        select: { content: true },
      }),
      this._signatures.model.signatures.findMany({
        where: { organizationId: org, deletedAt: null },
        select: { content: true },
      }),
    ]);

    return mediaUsage(
      files.map(({ id, path, _count }) => ({
        id,
        path,
        linked: Object.values(_count).some((n) => n > 0),
      })),
      posts,
      [...sets, ...signatures].map((p) => p.content)
    );
  }

  private usedIds(usage: Awaited<ReturnType<MediaRepository['usage']>>) {
    return [...usage].filter(([, u]) => u.used).map(([id]) => id);
  }

  async getMedia(
    org: string,
    page: number,
    search?: string,
    { usage: filter, folder }: Pick<GetMediaDto, 'usage' | 'folder'> = {}
  ) {
    const pageNum = (page || 1) - 1;
    const trimmedSearch = search?.trim();
    const searchFilter = trimmedSearch
      ? {
          originalName: {
            contains: trimmedSearch,
            mode: 'insensitive' as const,
          },
        }
      : {};
    const usage = await this.usage(org);
    // the used ones are the few: a library mostly fills up with leftovers
    const usedIds = this.usedIds(usage);
    const usageFilter =
      filter === 'used'
        ? { id: { in: usedIds } }
        : filter === 'unused'
        ? { id: { notIn: usedIds } }
        : {};
    const where: Prisma.MediaWhereInput = {
      organizationId: org,
      deletedAt: null,
      // still being normalized: it shows up once the workflow releases it
      status: { not: 'processing' },
      ...searchFilter,
      ...usageFilter,
      ...(folder && { folderId: folder === 'none' ? null : folder }),
    };
    const pages = Math.ceil((await this._media.model.media.count({ where })) / 18);
    const results = await this._media.model.media.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        thumbnailTimestamp: true,
        createdAt: true,
        folderId: true,
      },
      skip: pageNum * 18,
      take: 18,
    });

    return {
      pages,
      results: results.map((media) => ({
        ...media,
        posts: usage.get(media.id)?.posts ?? [],
      })),
    };
  }

  // soft delete, and only what is older than `before`, so a file uploaded a
  // moment ago and not yet attached to its post survives
  async deleteUnused(org: string, { before, search, prefix }: DeleteUnusedMediaDto) {
    const usedIds = this.usedIds(await this.usage(org));
    const { count } = await this._media.model.media.updateMany({
      where: {
        organizationId: org,
        deletedAt: null,
        status: { not: 'processing' },
        createdAt: { lt: new Date(before) },
        id: { notIn: usedIds },
        AND: [
          // raw material an operator sent (clips, photos) waits for its edit outside any
          // post, so it is never a leftover
          {
            OR: [
              { originalName: null },
              { NOT: { originalName: { startsWith: RAW_PREFIX } } },
            ],
          },
          ...(search || prefix
            ? [
                {
                  originalName: {
                    mode: 'insensitive' as const,
                    ...(search && { contains: search }),
                    ...(prefix && { startsWith: prefix }),
                  },
                },
              ]
            : []),
        ],
      },
      data: { deletedAt: new Date() },
    });
    return { deleted: count };
  }

  getFolders(org: string) {
    return this._folders.model.mediaFolder.findMany({
      where: { organizationId: org },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        note: true,
        _count: { select: { media: { where: { deletedAt: null } } } },
      },
    });
  }

  // a name is unique in an org, so saving an existing name returns that folder
  saveFolder(org: string, { name, note }: CreateMediaFolderDto) {
    return this._folders.model.mediaFolder.upsert({
      where: { organizationId_name: { organizationId: org, name } },
      create: { organizationId: org, name, note },
      update: note === undefined ? {} : { note },
    });
  }

  updateFolder(org: string, id: string, data: UpdateMediaFolderDto) {
    return this._folders.model.mediaFolder.update({
      where: { id, organizationId: org },
      data,
    });
  }

  // its files stay in the library, out of any folder
  deleteFolder(org: string, id: string) {
    return this._folders.model.mediaFolder.delete({
      where: { id, organizationId: org },
    });
  }

  getFolder(org: string, id: string) {
    return this._folders.model.mediaFolder.findFirst({
      where: { id, organizationId: org },
    });
  }

  async moveMedia(org: string, ids: string[], folderId: string | null) {
    const { count } = await this._media.model.media.updateMany({
      where: { id: { in: ids }, organizationId: org, deletedAt: null },
      data: { folderId },
    });
    return { moved: count };
  }
}
