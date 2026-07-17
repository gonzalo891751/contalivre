import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import MainLayout from './ui/Layout/MainLayout'
import CleanLayout from './layouts/CleanLayout'
import CleanPrototype from './pages/clean/CleanPrototype'
import Dashboard from './pages/Dashboard'
import OperacionesPage from './pages/OperacionesPage'
import Cuentas from './pages/Cuentas'
import Asientos from './pages/Asientos'
import Mayor from './pages/Mayor'
import Balance from './pages/Balance'
import PlanillasLayout from './pages/Planillas/PlanillasLayout'
import PlanillasHome from './pages/Planillas/PlanillasHome'

const ConfiguracionPage = lazy(() => import('./pages/ConfiguracionPage'))
const PracticaPage = lazy(() => import('./pages/PracticaPage'))

// Fase 2B (PER-001): las pantallas pesadas (estados, operaciones grandes,
// planillas con PDF/XLSX) se cargan bajo demanda para bajar el bundle inicial.
const Estados = lazy(() => import('./pages/Estados'))
const AmortizacionesPage = lazy(() => import('./pages/Planillas/AmortizacionesPage'))
const InventarioBienesPage = lazy(() => import('./pages/Planillas/InventarioBienesPage'))
const MonedaExtranjeraPage = lazy(() => import('./pages/Operaciones/MonedaExtranjeraPage'))
const PrestamosPage = lazy(() => import('./pages/Operaciones/PrestamosPage'))
const ImpuestosPage = lazy(() => import('./pages/Operaciones/ImpuestosPage'))
const BienesUsoPage = lazy(() => import('./pages/Operaciones/BienesUsoPage'))
const InversionesPage = lazy(() => import('./pages/Operaciones/InversionesPage'))
const ProveedoresAcreedoresPage = lazy(() => import('./pages/Operaciones/ProveedoresAcreedoresPage'))
const ClientesDeudoresPage = lazy(() => import('./pages/Operaciones/ClientesDeudoresPage'))
const DeudasSocialesPage = lazy(() => import('./pages/Operaciones/DeudasSocialesPage'))
const GastosServiciosPage = lazy(() => import('./pages/Operaciones/GastosServiciosPage'))
const ConciliacionesPage = lazy(() => import('./pages/Planillas/Conciliaciones/ConciliacionesPage'))
const CierreValuacionPage = lazy(() => import('./pages/Planillas/CierreValuacionPage'))

function MainLayoutRoute() {
    return (
        <MainLayout>
            <Suspense fallback={<div className="empty-state" style={{ padding: 48 }}>Cargando módulo…</div>}>
                <Outlet />
            </Suspense>
        </MainLayout>
    )
}

function CleanLayoutRoute() {
    return (
        <CleanLayout>
            <Outlet />
        </CleanLayout>
    )
}

function App() {
    return (
        <Routes>
            <Route element={<MainLayoutRoute />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/operaciones" element={<OperacionesPage />} />
                <Route path="/operaciones/inventario" element={<InventarioBienesPage />} />
                <Route path="/operaciones/moneda-extranjera" element={<MonedaExtranjeraPage />} />
                <Route path="/operaciones/prestamos" element={<PrestamosPage />} />
                <Route path="/operaciones/impuestos" element={<ImpuestosPage />} />
                <Route path="/operaciones/bienes-uso" element={<BienesUsoPage />} />
                <Route path="/operaciones/inversiones" element={<InversionesPage />} />
                <Route path="/operaciones/proveedores" element={<ProveedoresAcreedoresPage />} />
                <Route path="/operaciones/clientes" element={<ClientesDeudoresPage />} />
                <Route path="/operaciones/deudas-sociales" element={<DeudasSocialesPage />} />
                <Route path="/operaciones/gastos" element={<GastosServiciosPage />} />
                <Route path="/cuentas" element={<Cuentas />} />
                <Route path="/asientos" element={<Asientos />} />
                <Route path="/mayor" element={<Mayor />} />
                <Route path="/balance" element={<Balance />} />
                <Route path="/estados" element={<Estados />} />
                <Route path="/configuracion" element={<ConfiguracionPage />} />
                {/* Rutas consolidadas en Configuración (Fase 2D) */}
                <Route path="/mapeos" element={<Navigate to="/configuracion?seccion=plan-cuentas" replace />} />
                <Route path="/acerca" element={<Navigate to="/configuracion?seccion=acerca" replace />} />
                <Route path="/practica" element={<PracticaPage />} />
                <Route path="/planillas" element={<PlanillasLayout />}>
                    <Route index element={<PlanillasHome />} />
                    <Route path="inventario" element={<Navigate to="/operaciones/inventario" replace />} />
                    <Route path="conciliaciones" element={<ConciliacionesPage />} />
                    <Route path="amortizaciones" element={<AmortizacionesPage />} />
                    <Route path="cierre-valuacion" element={<CierreValuacionPage />} />
                </Route>
            </Route>
            <Route path="/clean" element={<CleanLayoutRoute />}>
                <Route path="prototype" element={<CleanPrototype />} />
            </Route>
        </Routes>
    )
}

export default App

