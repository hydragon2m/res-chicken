import { InventoryWorkspace } from '@/tinh-nang/kho-nguyen-lieu/inventory-workspace';
import type { InventorySectionKey } from '@/tinh-nang/kho-nguyen-lieu/types';

const sections: InventorySectionKey[] = [
  'stock',
  'receive',
  'transfer',
  'audit',
  'waste',
  'ledger',
  'recipes',
  'ingredients',
  'suppliers',
];

export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}

export default async function InventorySectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const initialSection = sections.includes(section as InventorySectionKey)
    ? (section as InventorySectionKey)
    : 'stock';
  return <InventoryWorkspace initialSection={initialSection} />;
}
