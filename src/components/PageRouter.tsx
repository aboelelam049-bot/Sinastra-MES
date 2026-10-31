import type { ModuleKey } from '@/types';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProductionPlanningPage } from '@/pages/modules/ProductionPlanningPage';
import { WorkOrdersPage } from '@/pages/modules/WorkOrdersPage';
import { MachineLoadingPage } from '@/pages/modules/MachineLoadingPage';
import { ProductsItemsPage } from '@/pages/modules/ProductsItemsPage';
import { MachinesPage } from '@/pages/modules/MachinesPage';
import { DepartmentsPage } from '@/pages/modules/DepartmentsPage';
import { WorkCentersPage } from '@/pages/modules/WorkCentersPage';
import { RoutingPage } from '@/pages/modules/RoutingPage';
import { ProductionExecutionPage } from '@/pages/modules/ProductionExecutionPage';
import { QualityControlPage } from '@/pages/modules/QualityControlPage';
import { BarcodePage } from '@/pages/modules/BarcodePage';
import { ParentBatchPage } from '@/pages/modules/ParentBatchPage';
import { ProductFamiliesPage } from '@/pages/modules/ProductFamiliesPage';
import { ProductModelsPage } from '@/pages/modules/ProductModelsPage';
import { ItemMasterPage } from '@/pages/modules/ItemMasterPage';
import { BOMPage } from '@/pages/modules/BOMPage';
import { WarehousePage } from '@/pages/modules/WarehousePage';
import { ReportsPage } from '@/pages/modules/ReportsPage';
import { UsersPage } from '@/pages/modules/UsersPage';
import { SettingsPage } from '@/pages/modules/SettingsPage';

export function PageRouter({ module }: { module: ModuleKey }) {
  switch (module) {
    case 'dashboard':
      return <DashboardPage />;
    case 'production-planning':
      return <ProductionPlanningPage />;
    case 'work-orders':
      return <WorkOrdersPage />;
    case 'machine-loading':
      return <MachineLoadingPage />;
    case 'products-items':
      return <ProductsItemsPage />;
    case 'machines':
      return <MachinesPage />;
    case 'departments':
      return <DepartmentsPage />;
    case 'work-centers':
      return <WorkCentersPage />;
    case 'routing':
      return <RoutingPage />;
    case 'production-execution':
      return <ProductionExecutionPage />;
    case 'quality-control':
      return <QualityControlPage />;
    case 'barcode':
      return <BarcodePage />;
    case 'parent-batches':
      return <ParentBatchPage />;
    case 'product-families':
      return <ProductFamiliesPage />;
    case 'product-models':
      return <ProductModelsPage />;
    case 'item-master':
      return <ItemMasterPage />;
    case 'bom':
      return <BOMPage />;
    case 'warehouse':
      return <WarehousePage />;
    case 'reports':
      return <ReportsPage />;
    case 'users':
      return <UsersPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <DashboardPage />;
  }
}
