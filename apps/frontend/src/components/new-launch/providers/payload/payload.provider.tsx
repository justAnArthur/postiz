'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { Input } from '@gitroom/react/form/input';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { MediaComponent } from '@gitroom/frontend/components/media/media.component';
import { MediumTags } from '@gitroom/frontend/components/new-launch/providers/medium/medium.tags';
import { PayloadCategories } from '@gitroom/frontend/components/new-launch/providers/payload/payload.categories';
import { PayloadDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/payload.dto';

const PayloadSettings: FC = () => {
  const form = useSettings();
  return (
    <>
      <Input label="Title" {...form.register('title')} />
      <Input label="Slug" {...form.register('slug')} />
      <Input label="Excerpt" {...form.register('excerpt')} />
      <Input
        label="Collection"
        placeholder="posts"
        {...form.register('collection')}
      />
      <PayloadCategories label="Categories" {...form.register('categories')} />
      <MediumTags label="Tags" {...form.register('tags')} />
      <MediaComponent
        label="Cover picture"
        description="Add a cover picture"
        {...form.register('main_image')}
      />
      <Input label="SEO title" {...form.register('meta_title')} />
      <Input label="SEO description" {...form.register('meta_description')} />
    </>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: PayloadSettings,
  CustomPreviewComponent: undefined,
  dto: PayloadDto,
  maximumCharacters: 100000,
});
