import { PlaceholderPage } from '../PlaceholderPage';
import { Warehouse } from 'lucide-react';

export function WarehousePage() {
  return (
    <PlaceholderPage
      title="مخزن الإنتاج"
      subtitle="Production Warehouse"
      icon={Warehouse}
      description="ستتيح هذه الوحدة إدارة عمليات تسليم واستلام المنتجات من خط الإنتاج إلى المخزن: تسليم الإنتاج، استلام المخزن، وتتبع المخزون."
    />
  );
}
