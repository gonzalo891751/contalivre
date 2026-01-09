import { Link } from 'react-router-dom'

export default function Practica() {
    return (
        <div>
            <header className="page-header">
                <h1 className="page-title">Modo Práctica</h1>
                <p className="page-subtitle">
                    Ejercicios guiados para aprender contabilidad paso a paso.
                </p>
            </header>

            <div className="card">
                <div className="empty-state">
                    <div className="empty-state-icon">🎯</div>
                    <div className="empty-state-text">
                        <h3>¡Próximamente!</h3>
                        <p style={{ maxWidth: '500px', margin: '0 auto' }}>
                            Estamos preparando ejercicios de práctica con corrección automática
                            y feedback didáctico para que puedas aprender contabilidad de forma
                            interactiva.
                        </p>
                    </div>

                    <div style={{ marginTop: 'var(--space-xl)' }}>
                        <h4 style={{ marginBottom: 'var(--space-md)' }}>Mientras tanto, podés:</h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', justifyContent: 'center' }}>
                            <Link to="/asientos" className="btn btn-primary">
                                📝 Cargar asientos de práctica
                            </Link>
                            <Link to="/cuentas" className="btn btn-secondary">
                                📋 Explorar el plan de cuentas
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card" style={{ marginTop: 'var(--space-xl)' }}>
                <h3 style={{ marginBottom: 'var(--space-md)' }}>📚 Ideas de ejercicios para practicar</h3>

                <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
                    <div className="alert alert-info">
                        <div>
                            <strong>Ejercicio 1: Constitución de empresa</strong>
                            <p style={{ margin: '0.5rem 0 0 0' }}>
                                Los socios aportan $100.000 en efectivo como Capital inicial.
                                <br />
                                <em>Pista: ¿Qué aumenta? Caja (Activo) y Capital (PN)</em>
                            </p>
                        </div>
                    </div>

                    <div className="alert alert-info">
                        <div>
                            <strong>Ejercicio 2: Compra de mercaderías</strong>
                            <p style={{ margin: '0.5rem 0 0 0' }}>
                                Se compran mercaderías por $20.000, pagando $10.000 en efectivo y el
                                resto en cuenta corriente.
                                <br />
                                <em>Pista: Mercaderías ↑, Caja ↓, Proveedores ↑</em>
                            </p>
                        </div>
                    </div>

                    <div className="alert alert-info">
                        <div>
                            <strong>Ejercicio 3: Venta de mercaderías</strong>
                            <p style={{ margin: '0.5rem 0 0 0' }}>
                                Se venden mercaderías por $15.000, cobrando en efectivo.
                                <br />
                                <em>Pista: Caja ↑, Ventas ↑ (Ingreso)</em>
                            </p>
                        </div>
                    </div>

                    <div className="alert alert-info">
                        <div>
                            <strong>Ejercicio 4: Pago de alquiler</strong>
                            <p style={{ margin: '0.5rem 0 0 0' }}>
                                Se paga el alquiler del mes por $5.000 en efectivo.
                                <br />
                                <em>Pista: Alquileres (Gasto) ↑, Caja ↓</em>
                            </p>
                        </div>
                    </div>
                </div>

                <p className="text-muted" style={{ marginTop: 'var(--space-lg)', fontSize: 'var(--font-size-sm)' }}>
                    💡 Andá a <Link to="/asientos">Libro Diario</Link> y probá cargar estos
                    asientos. Después verificá los resultados en{' '}
                    <Link to="/mayor">Mayor</Link> y <Link to="/estados">Estados Contables</Link>.
                </p>
            </div>
        </div>
    )
}
