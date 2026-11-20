const vietnameseDateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const vietnameseDate = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export const formatVnd = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);

export const formatQuantity = (value: number, unit?: string) =>
  `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value)}${unit ? ` ${unit}` : ''}`;

export const formatDate = (value: string | Date) => vietnameseDate.format(new Date(value));

export const formatDateTime = (value: string | Date) => vietnameseDateTime.format(new Date(value));

export const formatTime = (value: string | Date) =>
  new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
