'use client';

import { FC, useEffect, useState } from 'react';
import { MultiSelect } from '@gitroom/react/form/multi.select';
import { useCustomProviderFunction } from '@gitroom/frontend/components/launches/helpers/use.custom.provider.function';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';

// Like WordpressTerms, but keeps the ids as Payload returns them: numbers on
// SQL databases, strings on MongoDB.
export const PayloadCategories: FC<{
  name: string;
  label: string;
  onChange: (event: {
    target: {
      value: Array<string | number>;
      name: string;
    };
  }) => void;
}> = (props) => {
  const { name, label, onChange } = props;
  const customFunc = useCustomProviderFunction();
  const form = useSettings();
  const [categories, setCategories] = useState<
    Array<{ id: string | number; name: string }>
  >([]);
  const [selected, setSelected] = useState<Array<string | number>>([]);

  useEffect(() => {
    customFunc.get('categoriesList').then((data) => setCategories(data || []));
    const settings = form.getValues()[name];
    if (Array.isArray(settings)) {
      setSelected(settings);
    }
  }, []);

  const onChangeInner = (value: Array<string | number>) => {
    setSelected(value);
    form.setValue(name, value, { shouldValidate: true });
    onChange?.({ target: { name, value } });
  };

  if (!categories.length) {
    return null;
  }

  return (
    <MultiSelect
      name={name}
      label={label}
      value={selected}
      onChange={onChangeInner}
      options={categories.map((category) => ({
        label: category.name,
        value: category.id,
      }))}
    />
  );
};
