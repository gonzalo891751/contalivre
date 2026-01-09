import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './ui/Layout/MainLayout'
import Dashboard from './pages/Dashboard'
import Cuentas from './pages/Cuentas'
import Asientos from './pages/Asientos'
import Mayor from './pages/Mayor'
import Balance from './pages/Balance'
import Estados from './pages/Estados'
import AmortizacionesPage from './pages/Planillas/AmortizacionesPage'
import InventarioPage from './pages/Planillas/InventarioPage'
import PlanillasLayout from './pages/Planillas/PlanillasLayout'
import PlanillasHome from './pages/Planillas/PlanillasHome'

function App() {
    return (
        <MainLayout>
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/cuentas" element={<Cuentas />} />
                <Route path="/asientos" element={<Asientos />} />
                <Route path="/mayor" element={<Mayor />} />
                <Route path="/balance" element={<Balance />} />
                <Route path="/estados" element={<Estados />} />
                <Route path="/practica" element={<Navigate to="/" replace />} />
                <Route path="/planillas" element={<PlanillasLayout />}>
                    <Route index element={<PlanillasHome />} />
                    <Route path="inventario" element={<InventarioPage />} />
                    <Route path="amortizaciones" element={<AmortizacionesPage />} />
                </Route>
            </Routes>
        </MainLayout>
    )
}

export default App

