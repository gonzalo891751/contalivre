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
import Estados from './pages/Estados'
import AmortizacionesPage from './pages/Planillas/AmortizacionesPage'
import InventarioBienesPage from './pages/Planillas/InventarioBienesPage'
import MonedaExtranjeraPage from './pages/Operaciones/MonedaExtranjeraPage'
import PrestamosPage from './pages/Operaciones/PrestamosPage'
import ImpuestosPage from './pages/Operaciones/ImpuestosPage'
import BienesUsoPage from './pages/Operaciones/BienesUsoPage'
import InversionesPage from './pages/Operaciones/InversionesPage'
import ProveedoresAcreedoresPage from './pages/Operaciones/ProveedoresAcreedoresPage'
import ClientesDeudoresPage from './pages/Operaciones/ClientesDeudoresPage'
import DeudasSocialesPage from './pages/Operaciones/DeudasSocialesPage'
import ConciliacionesPage from './pages/Planillas/Conciliaciones/ConciliacionesPage'
import CierreValuacionPage from './pages/Planillas/CierreValuacionPage'
import PlanillasLayout from './pages/Planillas/PlanillasLayout'
import PlanillasHome from './pages/Planillas/PlanillasHome'

function MainLayoutRoute() {
    return (
        <MainLayout>
            <Outlet />
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
                <Route path="/cuentas" element={<Cuentas />} />
                <Route path="/asientos" element={<Asientos />} />
                <Route path="/mayor" element={<Mayor />} />
                <Route path="/balance" element={<Balance />} />
                <Route path="/estados" element={<Estados />} />
                <Route path="/practica" element={<Navigate to="/" replace />} />
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

