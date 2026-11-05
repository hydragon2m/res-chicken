import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const store = await prisma.store.findFirst();
  if (!store) {
    console.error("No store found");
    return;
  }
  console.log(`Using Store: ${store.name} (${store.id})`);

  // Ensure categories exist
  const categoriesDef = [
    { name: 'Gà rán', sortOrder: 1 },
    { name: 'Burger & Mì Ý', sortOrder: 2 },
    { name: 'Cơm & Combo', sortOrder: 3 },
    { name: 'Món ăn kèm', sortOrder: 4 },
    { name: 'Đồ uống', sortOrder: 5 },
  ];

  const catMap = {};
  for (const c of categoriesDef) {
    let cat = await prisma.category.findFirst({
      where: { storeId: store.id, name: c.name }
    });
    if (!cat) {
      cat = await prisma.category.create({
        data: { storeId: store.id, name: c.name, sortOrder: c.sortOrder, isActive: true }
      });
      console.log(`Created Category: ${c.name}`);
    }
    catMap[c.name] = cat.id;
  }

  // Define full menu
  const menuItems = [
    {
      category: 'Gà rán',
      name: 'Gà rán sốt cay Hàn Quốc',
      variant: '1 Miếng (Cay vừa)',
      price: 49000,
    },
    {
      category: 'Gà rán',
      name: 'Cánh gà chiên giòn sốt bơ tỏi',
      variant: 'Phần 3 cánh',
      price: 65000,
    },
    {
      category: 'Burger & Mì Ý',
      name: 'Burger gà giòn Zinger',
      variant: 'Tiêu chuẩn',
      price: 55000,
    },
    {
      category: 'Burger & Mì Ý',
      name: 'Mì Ý sốt bò bằm cà chua',
      variant: 'Đĩa vừa',
      price: 49000,
    },
    {
      category: 'Cơm & Combo',
      name: 'Combo Gà rán & Khoai tây & Nước',
      variant: 'Combo 1 người',
      price: 89000,
    },
    {
      category: 'Món ăn kèm',
      name: 'Khoai tây chiên giòn',
      variant: 'Size L lớn',
      price: 29000,
    },
    {
      category: 'Món ăn kèm',
      name: 'Gà viên Popcorn lắc phô mai',
      variant: 'Hộp 100g',
      price: 39000,
    },
    {
      category: 'Đồ uống',
      name: 'Coca-Cola tươi có ga',
      variant: 'Ly 500ml',
      price: 18000,
    },
    {
      category: 'Đồ uống',
      name: 'Trà chanh sả hạt chia',
      variant: 'Ly 500ml',
      price: 25000,
    },
  ];

  for (const item of menuItems) {
    const catId = catMap[item.category];
    let prod = await prisma.product.findFirst({
      where: { storeId: store.id, name: item.name }
    });

    if (!prod) {
      prod = await prisma.product.create({
        data: {
          storeId: store.id,
          categoryId: catId,
          name: item.name,
          isActive: true,
          isSoldOut: false,
        }
      });
      console.log(`Created Product: ${item.name}`);

      const variant = await prisma.productVariant.create({
        data: {
          productId: prod.id,
          name: item.variant,
          isSoldOut: false,
        }
      });

      await prisma.priceSchedule.create({
        data: {
          variantId: variant.id,
          amount: item.price,
          startsAt: new Date(),
        }
      });
      console.log(`  Added Variant & Price: ${item.variant} - ${item.price} VND`);
    }
  }

  console.log("Rich menu successfully populated!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
