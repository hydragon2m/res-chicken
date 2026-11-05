import { CatalogWorkspace } from '@/features/catalog/catalog-workspace';

const sections = ['categories', 'products', 'option-groups', 'price-schedules'] as const;

export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}

export default async function CatalogPage(props: PageProps<'/admin/catalog/[section]'>) {
  const { section } = await props.params;
  const initialSection = sections.includes(section as (typeof sections)[number])
    ? (section as (typeof sections)[number])
    : 'categories';
  return <CatalogWorkspace initialSection={initialSection} />;
}
