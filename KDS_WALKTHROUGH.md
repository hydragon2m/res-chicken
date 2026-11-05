# KDS walkthrough

1. Start the stack with `docker compose up --build -d` and sign in with a user that has POS and kitchen permissions.
2. At `/pos`, open a shift, add a sellable item, create the order, then capture either cash or manual QR payment.
3. The paid order creates exactly one queued fulfillment ticket in the same database transaction as the payment.
4. Open `/kds/frying`, press **Nhận làm**, then **Báo sẵn sàng**.
5. Open `/kds/packing` and press **Đã bàn giao**.

KDS polls every 10 seconds; **Làm mới ngay** is available when an immediate refresh is needed. Repeating a transition to its current target is safe and does not add another event. Invalid backwards/skipped transitions return `409`.

Required permissions are `fulfillment.read` and `fulfillment.manage`; the seed grants both to `ADMIN`, `MANAGER`, and `KITCHEN` roles.
