import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { PayloadDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/payload.dto';
import slugify from 'slugify';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

type PayloadToken = {
  url: string;
  collection: string;
  apiKey: string;
  postUrl: string;
};

@Rules(
  'Payload publishes the content as a blog article: the body is markdown that the blog converts to rich text, pictures inside the body stay links, attachments are not published, the cover picture is the main_image setting'
)
export class PayloadProvider extends SocialAbstract implements SocialProvider {
  identifier = 'payload';
  name = 'Payload';
  isBetweenSteps = false;
  editor = 'markdown' as const;
  scopes = [] as string[];
  override maxConcurrentJob = 8; // Payload sites are the customer's own servers
  dto = PayloadDto;
  maxLength() {
    return 100000;
  }

  async generateAuthUrl() {
    const state = makeSecureId(6);
    return {
      url: state,
      codeVerifier: makeSecureId(10),
      state,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  override handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    if (status === 403) {
      return {
        type: 'bad-body',
        value:
          'Payload refused the request: the API key user has no access to this collection',
      };
    }

    if (status === 400) {
      try {
        return {
          type: 'bad-body',
          value: JSON.parse(body).errors[0].message,
        };
      } catch (err) {
        return { type: 'bad-body', value: 'Payload rejected the post' };
      }
    }

    return undefined;
  }

  async customFields() {
    return [
      {
        key: 'url',
        label: 'Payload URL',
        validation: `/^https?:\\/\\/[^\\s\\/]+(\\/[^\\s]*)?$/`,
        type: 'text' as const,
        hint: 'The address the Payload admin runs on, without /api',
      },
      {
        key: 'collection',
        label: 'Users collection',
        defaultValue: 'users',
        validation: `/^[a-z0-9-_]+$/`,
        type: 'text' as const,
        hint: 'The auth collection the API key belongs to, it needs useAPIKey: true',
      },
      {
        key: 'apiKey',
        label: 'API key',
        validation: `/.+/`,
        type: 'password' as const,
      },
      {
        key: 'postUrl',
        label: 'Public post URL',
        validation: `/^https?:\\/\\/\\S*\\{(slug|id)\\}\\S*$/`,
        type: 'text' as const,
        hint: 'Where a published post lives, e.g. https://example.com/posts/{slug}',
      },
    ];
  }

  private token(accessToken: string): PayloadToken {
    const token = JSON.parse(Buffer.from(accessToken, 'base64').toString());
    // users paste the address with a trailing slash or the /api suffix
    return {
      ...token,
      url: token.url
        .trim()
        .replace(/\/+$/, '')
        .replace(/\/api$/, ''),
    };
  }

  private headers(token: PayloadToken) {
    return {
      Authorization: `${token.collection} API-Key ${token.apiKey}`,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const token = this.token(params.code);

    // Direct fetch (not `this.fetch`) so a bad URL or key comes back as a
    // message for the connect form instead of an exception.
    try {
      const response = await fetch(`${token.url}/api/${token.collection}/me`, {
        headers: this.headers(token),
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      });

      const { user } = await response.json();
      if (!user?.id) {
        return 'Payload did not accept the API key';
      }

      return {
        refreshToken: '',
        expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
        accessToken: params.code,
        id: token.url + '_' + user.id,
        name: user.name || user.email || token.url,
        picture: '',
        username: user.email || String(user.id),
      };
    } catch (err) {
      console.log(err);
      return 'Could not reach Payload. Check the Payload URL and that the site is publicly accessible.';
    }
  }

  @Tool({
    description: 'Get list of categories',
    dataSchema: [],
  })
  async categoriesList(accessToken: string) {
    const token = this.token(accessToken);
    const { docs } = await (
      await this.fetch(
        `${token.url}/api/categories?limit=100&depth=0&sort=title`,
        { headers: this.headers(token) }
      )
    ).json();

    return (docs || []).map((category: any) => ({
      id: category.id,
      name: category.title || category.name || String(category.id),
    }));
  }

  // Postiz upload names are unique, so a media doc with the same filename is
  // the one an earlier attempt or edit already uploaded.
  private async uploadCover(
    token: PayloadToken,
    image: PayloadDto['main_image'],
    alt: string
  ) {
    const filename = image.path.split('/').pop().split('?')[0];
    const { docs } = await (
      await this.fetch(
        `${
          token.url
        }/api/media?limit=1&depth=0&where[filename][equals]=${encodeURIComponent(
          filename
        )}`,
        { headers: this.headers(token) }
      )
    ).json();

    if (docs?.[0]?.id) {
      return docs[0].id;
    }

    const form = new FormData();
    form.append('file', await (await this.fetch(image.path)).blob(), filename);
    form.append('_payload', JSON.stringify({ alt: image.alt || alt }));

    const { doc } = await (
      await this.fetch(`${token.url}/api/media`, {
        method: 'POST',
        headers: this.headers(token),
        body: form,
      })
    ).json();

    return doc.id;
  }

  private async toDoc(
    token: PayloadToken,
    postDetails: PostDetails<PayloadDto>
  ) {
    const { settings } = postDetails;
    const cover = settings.main_image?.path
      ? await this.uploadCover(token, settings.main_image, settings.title)
      : undefined;
    const description = settings.meta_description || settings.excerpt;

    return {
      title: settings.title,
      slug:
        settings.slug ||
        slugify(settings.title, { lower: true, strict: true, trim: true }),
      // the blog's beforeChange hook turns this into the Lexical body
      markdown: postDetails.message,
      ...(settings.excerpt ? { excerpt: settings.excerpt } : {}),
      ...(settings.categories?.length
        ? { categories: settings.categories }
        : {}),
      ...(settings.tags?.length
        ? { tags: settings.tags.map((tag) => tag.label) }
        : {}),
      ...(cover ? { heroImage: cover } : {}),
      meta: {
        title: settings.meta_title || settings.title,
        ...(description ? { description } : {}),
        ...(cover ? { image: cover } : {}),
      },
      _status: 'published',
    };
  }

  private releaseURL(token: PayloadToken, collection: string, doc: any) {
    return token.postUrl
      .replace('{collection}', collection)
      .replace('{slug}', doc.slug)
      .replace('{id}', String(doc.id));
  }

  private docUrl(token: PayloadToken, settings: PayloadDto, id = '') {
    return `${token.url}/api/${settings.collection || 'posts'}${
      id ? `/${id}` : ''
    }`;
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<PayloadDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const token = this.token(accessToken);
    const [first] = postDetails;

    const { doc } = await (
      await this.fetch(this.docUrl(token, first.settings), {
        method: 'POST',
        headers: { ...this.headers(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(await this.toDoc(token, first)),
          publishedAt: new Date().toISOString(),
        }),
      })
    ).json();

    return [
      {
        id: first.id,
        status: 'completed',
        postId: String(doc.id),
        releaseURL: this.releaseURL(
          token,
          first.settings.collection || 'posts',
          doc
        ),
      },
    ];
  }

  async editPost(
    accessToken: string,
    releaseId: string,
    postDetails: PostDetails<PayloadDto>,
    integration: Integration
  ) {
    const token = this.token(accessToken);

    const { doc } = await (
      await this.fetch(this.docUrl(token, postDetails.settings, releaseId), {
        method: 'PATCH',
        headers: { ...this.headers(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(await this.toDoc(token, postDetails)),
      })
    ).json();

    return {
      postId: String(doc.id),
      releaseURL: this.releaseURL(
        token,
        postDetails.settings.collection || 'posts',
        doc
      ),
    };
  }

  async deletePost(
    accessToken: string,
    releaseId: string,
    settings: PayloadDto,
    integration: Integration
  ) {
    const token = this.token(accessToken);
    await this.fetch(this.docUrl(token, settings, releaseId), {
      method: 'DELETE',
      headers: this.headers(token),
    });
  }
}
