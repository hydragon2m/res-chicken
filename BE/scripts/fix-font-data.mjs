import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Checking categories before fix...");
  const categories = await prisma.category.findMany();
  for (const cat of categories) {
    console.log(`Cat: ${cat.id} -> ${cat.name}`);
    if (cat.name.includes('?')) {
      let newName = cat.name;
      if (cat.name === 'G? r?n') newName = 'Gà rán';
      else if (cat.name === 'C?m & Combo') newName = 'Cơm & Combo';
      else if (cat.name === '?? u?ng') newName = 'Đồ uống';
      await prisma.category.update({
        where: { id: cat.id },
        data: { name: newName }
      });
      console.log(`Updated Category: ${cat.name} -> ${newName}`);
    }
  }

  console.log("Checking products before fix...");
  const products = await prisma.product.findMany();
  for (const prod of products) {
    console.log(`Prod: ${prod.id} -> ${prod.name}`);
    if (prod.name.includes('?')) {
      let newName = prod.name;
      if (prod.name === 'G? r?n truy?n th?ng') newName = 'Gà rán truyền thống';
      else if (prod.name === 'G? r?n cay') newName = 'Gà rán cay';
      else if (prod.name === 'C?m g? gi?n') newName = 'Cơm gà giòn';
      else if (prod.name === 'Tr? ??o') newName = 'Trà đào';
      await prisma.product.update({
        where: { id: prod.id },
        data: { name: newName }
      });
      console.log(`Updated Product: ${prod.name} -> ${newName}`);
    }
  }

  console.log("Checking variants before fix...");
  const variants = await prisma.productVariant.findMany();
  for (const v of variants) {
    if (v.name.includes('?')) {
      let newName = v.name;
      if (v.name === 'Ti?u chu?n') newName = 'Tiêu chuẩn';
      await prisma.productVariant.update({
        where: { id: v.id },
        data: { name: newName }
      });
      console.log(`Updated Variant: ${v.name} -> ${newName}`);
    }
  }

  console.log("Checking order items before fix...");
  const orderItems = await prisma.orderItem.findMany();
  for (const oi of orderItems) {
    let pName = oi.productName;
    let vName = oi.variantName;
    let changed = false;
    if (pName === 'G? r?n truy?n th?ng') { pName = 'Gà rán truyền thống'; changed = true; }
    else if (pName === 'G? r?n cay') { pName = 'Gà rán cay'; changed = true; }
    else if (pName === 'C?m g? gi?n') { pName = 'Cơm gà giòn'; changed = true; }
    else if (pName === 'Tr? ??o') { pName = 'Trà đào'; changed = true; }
    if (vName === 'Ti?u chu?n') { vName = 'Tiêu chuẩn'; changed = true; }
    if (changed) {
      await prisma.orderItem.update({
        where: { id: oi.id },
        data: { productName: pName, variantName: vName }
      });
    }
  }

  console.log("Checking fulfillment ticket items before fix...");
  const ticketItems = await prisma.fulfillmentTicketItem.findMany();
  for (const ti of ticketItems) {
    let pName = ti.productName;
    let vName = ti.variantName;
    let changed = false;
    if (pName === 'G? r?n truy?n th?ng') { pName = 'Gà rán truyền thống'; changed = true; }
    else if (pName === 'G? r?n cay') { pName = 'Gà rán cay'; changed = true; }
    else if (pName === 'C?m g? gi?n') { pName = 'Cơm gà giòn'; changed = true; }
    else if (pName === 'Tr? ??o') { pName = 'Trà đào'; changed = true; }
    if (vName === 'Ti?u chu?n') { vName = 'Tiêu chuẩn'; changed = true; }
    if (changed) {
      await prisma.fulfillmentTicketItem.update({
        where: { id: ti.id },
        data: { productName: pName, variantName: vName }
      });
    }
  }

  console.log("Data repair complete!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
