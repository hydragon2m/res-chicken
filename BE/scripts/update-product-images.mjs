import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const imageMapping = [
  {
    nameMatch: 'truyền thống',
    imageUrl: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=500&q=80',
  },
  {
    nameMatch: 'Gà rán cay',
    imageUrl: 'https://images.unsplash.com/photo-1569058242253-92a9c755a0ec?auto=format&fit=crop&w=500&q=80',
  },
  {
    nameMatch: 'Hàn Quốc',
    imageUrl: 'https://images.unsplash.com/photo-1527477378408-1bc09c213137?auto=format&fit=crop&w=500&q=80',
  },
  {
    nameMatch: 'bơ tỏi',
    imageUrl: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=500&q=80',
  },
  {
    nameMatch: 'Burger',
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80',
  },
  {
    nameMatch: 'Mì Ý',
    imageUrl: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281724?auto=format&fit=crop&w=500&q=80',
  },
  {
    nameMatch: 'Cơm gà',
    imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80',
  },
  {
    nameMatch: 'Combo',
    imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=500&q=80',
  },
  {
    nameMatch: 'Khoai tây',
    imageUrl: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=500&q=80',
  },
  {
    nameMatch: 'Popcorn',
    imageUrl: 'https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=500&q=80',
  },
  {
    nameMatch: 'Trà đào',
    imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=500&q=80',
  },
  {
    nameMatch: 'Coca-Cola',
    imageUrl: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=500&q=80',
  },
  {
    nameMatch: 'hạt chia',
    imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80',
  },
];

async function main() {
  const products = await prisma.product.findMany();
  console.log(`Found ${products.length} products to update`);

  for (const p of products) {
    let matchedImg = null;
    for (const mapping of imageMapping) {
      if (p.name.includes(mapping.nameMatch)) {
        matchedImg = mapping.imageUrl;
        break;
      }
    }
    if (!matchedImg) {
      matchedImg = 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=500&q=80';
    }

    await prisma.product.update({
      where: { id: p.id },
      data: { imageUrl: matchedImg }
    });
    console.log(`Updated "${p.name}" with imageUrl`);
  }

  console.log("All products updated successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
