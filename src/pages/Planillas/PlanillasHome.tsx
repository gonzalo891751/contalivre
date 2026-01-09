import { Link } from 'react-router-dom'

export default function PlanillasHome() {
    return (
        <div className="planillas-home">
            <div className="grid-cards">
                {/* Card 1: Inventario */}
                <div className="card planillas-card">
                    <div className="card-header">
                        <div className="flex items-center justify-between width-100">
                            <div className="flex items-center gap-md">
                                <span className="text-2xl">📦</span>
                                <h3 className="card-title">Inventario periódico</h3>
                            </div>
                            <span className="badge badge-blue">Stock</span>
                        </div>
                    </div>
                    <div className="card-body">
                        <p className="text-secondary mb-lg">
                            Registrá movimientos, calculá cierre por diferencias y generá el resumen.
                        </p>
                        <Link to="/planillas/inventario" className="btn btn-primary width-100">
                            Abrir
                        </Link>
                    </div>
                </div>

                {/* Card 2: Amortizaciones */}
                <div className="card planillas-card">
                    <div className="card-header">
                        <div className="flex items-center justify-between width-100">
                            <div className="flex items-center gap-md">
                                <span className="text-2xl">🧮</span>
                                <h3 className="card-title">Amortizaciones</h3>
                            </div>
                            <span className="badge badge-green">Bienes de uso</span>
                        </div>
                    </div>
                    <div className="card-body">
                        <p className="text-secondary mb-lg">
                            Cargá bienes, definí vida útil y obtené amortización del ejercicio.
                        </p>
                        <Link to="/planillas/amortizaciones" className="btn btn-primary width-100">
                            Abrir
                        </Link>
                    </div>
                </div>

                {/* Card 3: Próximamente */}
                <div className="card planillas-card disabled opacity-60">
                    <div className="card-header">
                        <div className="flex items-center justify-between width-100">
                            <div className="flex items-center gap-md">
                                <span className="text-2xl">🚧</span>
                                <h3 className="card-title">Próximamente</h3>
                            </div>
                        </div>
                    </div>
                    <div className="card-body">
                        <p className="text-secondary mb-lg">
                            Nueva herramienta en desarrollo.
                        </p>
                        <button className="btn btn-secondary width-100" disabled>
                            No disponible
                        </button>
                    </div>
                </div>
            </div>

            <style>{`
                .grid-cards {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: var(--space-lg);
                    margin-top: var(--space-lg);
                }
                .planillas-card {
                    transition: transform 0.2s, box-shadow 0.2s;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                }
                .planillas-card:not(.disabled):hover {
                    transform: translateY(-4px);
                    box-shadow: var(--shadow-lg);
                    border-color: var(--primary-color);
                }
                .planillas-card .card-body {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                }
                .width-100 { width: 100%; }
                .text-2xl { font-size: 1.5rem; }
                .badge-blue { background-color: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; font-weight: 600; }
                .badge-green { background-color: #e8f5e9; color: #2e7d32; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; font-weight: 600; }
                .opacity-60 { opacity: 0.6; }
                .gap-md { gap: var(--space-md); }
                .mb-lg { margin-bottom: var(--space-lg); }
            `}</style>
        </div>
    )
}
