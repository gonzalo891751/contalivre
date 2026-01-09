import { Routes, Route } from 'react-router-dom'
import MainLayout from './ui/Layout/MainLayout'
import Dashboard from './pages/Dashboard'
import Cuentas from './pages/Cuentas'
import Asientos from './pages/Asientos'
import Mayor from './pages/Mayor'
import Balance from './pages/Balance'
import Estados from './pages/Estados'
import Practica from './pages/Practica'

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
                <Route path="/practica" element={<Practica />} />
            </Routes>
        </MainLayout>
    )
}

export default App
