'use client';

import React, { FC, KeyboardEvent, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@gitroom/frontend/components/ui/icons';

export type MediaFolder = {
  id: string;
  name: string;
  note: string | null;
  _count: { media: number };
};

// undefined shows every file, 'none' the files in no folder, otherwise a folder id
export type FolderFilter = string | undefined;

export function useMediaFolders() {
  const fetch = useFetch();
  return useSWR<MediaFolder[]>('media-folders', async () =>
    (await fetch('/media/folders')).json()
  );
}

function useSaveFolder() {
  const fetch = useFetch();
  const toaster = useToaster();
  return async (
    id: string | undefined,
    body: { name?: string; note?: string }
  ): Promise<MediaFolder | undefined> => {
    const res = await fetch(id ? `/media/folders/${id}` : '/media/folders', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toaster.show((await res.json()).message || 'Could not save', 'warning');
      return;
    }
    return res.json();
  };
}

const NameInput: FC<{
  initial?: string;
  onDone: (name: string | undefined) => void;
}> = ({ initial = '', onDone }) => {
  const finish = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onDone(undefined);
    }
    if (e.key === 'Enter') {
      onDone(e.currentTarget.value.trim() || undefined);
    }
  };
  return (
    <input
      autoFocus
      defaultValue={initial}
      onKeyDown={finish}
      onBlur={(e) => onDone(e.currentTarget.value.trim() || undefined)}
      className="w-full h-[32px] px-[8px] rounded-[6px] bg-newBgColorInner border border-[#612BD3] text-[14px] outline-none"
    />
  );
};

export const FolderList: FC<{
  folders: MediaFolder[];
  current: FolderFilter;
  onSelect: (folder: FolderFilter) => void;
  onChanged: () => void;
}> = ({ folders, current, onSelect, onChanged }) => {
  const t = useT();
  const fetch = useFetch();
  const saveFolder = useSaveFolder();
  const [renaming, setRenaming] = useState<string>();
  const [creating, setCreating] = useState(false);

  const create = async (name: string | undefined) => {
    setCreating(false);
    if (!name) {
      return;
    }
    const folder = await saveFolder(undefined, { name });
    onChanged();
    if (folder) {
      onSelect(folder.id);
    }
  };

  const rename = async (folder: MediaFolder, name: string | undefined) => {
    setRenaming(undefined);
    if (!name || name === folder.name) {
      return;
    }
    await saveFolder(folder.id, { name });
    onChanged();
  };

  const remove = async (folder: MediaFolder) => {
    const confirmed = await deleteDialog(
      t(
        'delete_media_folder',
        'Delete this folder? Its files stay in the library, out of any folder.'
      )
    );
    if (!confirmed) {
      return;
    }
    await fetch(`/media/folders/${folder.id}`, { method: 'DELETE' });
    if (current === folder.id) {
      onSelect(undefined);
    }
    onChanged();
  };

  const row = (active: boolean) =>
    clsx(
      'group flex items-center gap-[6px] h-[36px] px-[10px] rounded-[8px] cursor-pointer text-[14px]',
      active ? 'bg-[#612BD3] text-white' : 'hover:bg-newColColor'
    );

  return (
    <div className="flex flex-col gap-[2px] w-[220px] shrink-0 overflow-y-auto">
      <div
        className={row(current === undefined)}
        onClick={() => onSelect(undefined)}
      >
        {t('all_media', 'All')}
      </div>
      <div className={row(current === 'none')} onClick={() => onSelect('none')}>
        {t('media_no_folder', 'No folder')}
      </div>
      <div className="h-px bg-newColColor my-[6px]" />
      {folders.map((folder) =>
        renaming === folder.id ? (
          <NameInput
            key={folder.id}
            initial={folder.name}
            onDone={(name) => rename(folder, name)}
          />
        ) : (
          <div
            key={folder.id}
            className={row(current === folder.id)}
            onClick={() => onSelect(folder.id)}
            title={folder.name}
          >
            <div className="flex-1 truncate">{folder.name}</div>
            <div className="text-[12px] opacity-60 group-hover:hidden">
              {folder._count.media}
            </div>
            <PencilIcon
              size={14}
              className="hidden group-hover:block opacity-70 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                setRenaming(folder.id);
              }}
            />
            <TrashIcon
              size={14}
              className="hidden group-hover:block opacity-70 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                remove(folder);
              }}
            />
          </div>
        )
      )}
      {creating ? (
        <NameInput onDone={create} />
      ) : (
        <div
          className="flex items-center gap-[6px] h-[36px] px-[10px] rounded-[8px] cursor-pointer text-[14px] text-newTextColor/[0.6] hover:bg-newColColor"
          onClick={() => setCreating(true)}
        >
          <PlusIcon size={12} />
          {t('new_media_folder', 'New folder')}
        </div>
      )}
    </div>
  );
};

/** Picks a folder where a sidebar doesn't fit: the picker over the post editor, and phones. */
export const FolderSelect: FC<{
  folders: MediaFolder[];
  current: FolderFilter;
  onSelect: (folder: FolderFilter) => void;
  className?: string;
}> = ({ folders, current, onSelect, className }) => {
  const t = useT();
  return (
    <select
      value={current ?? ''}
      onChange={(e) => onSelect(e.target.value || undefined)}
      className={clsx(
        'h-[44px] px-[10px] rounded-[8px] bg-newBgColorInner border border-newColColor text-[14px] outline-none',
        className
      )}
    >
      <option value="">{t('all_media', 'All')}</option>
      <option value="none">{t('media_no_folder', 'No folder')}</option>
      {folders.map((folder) => (
        <option key={folder.id} value={folder.id}>
          {folder.name}
        </option>
      ))}
    </select>
  );
};

export const FolderNote: FC<{ folder: MediaFolder; onChanged: () => void }> = ({
  folder,
  onChanged,
}) => {
  const t = useT();
  const saveFolder = useSaveFolder();
  const [draft, setDraft] = useState<string>();

  const save = async () => {
    if (await saveFolder(folder.id, { note: draft ?? '' })) {
      setDraft(undefined);
      onChanged();
    }
  };

  return (
    <div className="flex flex-col gap-[10px] w-[360px] shrink-0 mobile:w-full rounded-[12px] border border-newColColor p-[14px] overflow-hidden">
      <div className="flex items-center gap-[8px]">
        <div className="flex-1 font-[600] truncate">{folder.name}</div>
        {draft === undefined ? (
          <button
            onClick={() => setDraft(folder.note ?? '')}
            className="flex items-center gap-[6px] text-[13px] opacity-70 hover:opacity-100"
          >
            <PencilIcon size={14} />
            {t('edit', 'Edit')}
          </button>
        ) : (
          <>
            <button
              onClick={() => setDraft(undefined)}
              className="text-[13px] opacity-70 hover:opacity-100"
            >
              {t('cancel', 'Cancel')}
            </button>
            <button
              onClick={save}
              className="text-[13px] px-[10px] h-[28px] rounded-[6px] bg-[#612BD3] text-white"
            >
              {t('save', 'Save')}
            </button>
          </>
        )}
      </div>
      {draft === undefined ? (
        <div className="flex-1 overflow-y-auto whitespace-pre-wrap text-[14px] leading-[1.5]">
          {folder.note || (
            <span className="opacity-50">
              {t(
                'media_folder_note_empty',
                'No note yet. Keep what goes with these files here: a script, a shot list, who films and by when.'
              )}
            </span>
          )}
        </div>
      ) : (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 min-h-[240px] p-[10px] rounded-[8px] bg-newBgColorInner border border-newColColor text-[14px] leading-[1.5] outline-none focus:border-[#612BD3] resize-none"
        />
      )}
    </div>
  );
};
