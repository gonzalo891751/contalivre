/**
 * CompanyProfileModal
 * Two-column modal for editing company profile data
 * Pixel-perfect replication of docs/prototypes/Datosiniciales.html
 */

import { useState, useEffect } from 'react'
import { X, Building2, IdCard, Calendar, Landmark, Globe, User, FileText, AlertCircle } from 'lucide-react'
import type { CompanyProfile } from '../../core/companyProfile/types'
import './CompanyProfile.css'

interface CompanyProfileModalProps {
    isOpen: boolean
    onClose: () => void
    profile: CompanyProfile | null
    onSave: (data: Partial<CompanyProfile>) => Promise<void>
    isSaving?: boolean
}

const LEGAL_FORMS = ['S.A.', 'S.R.L.', 'S.A.S.', 'Unipersonal'] as const

export function CompanyProfileModal({
    isOpen,
    onClose,
    profile,
    onSave,
    isSaving = false,
}: CompanyProfileModalProps) {
    // Form state
    const [formData, setFormData] = useState<Partial<CompanyProfile>>({})
    const [advancedMode, setAdvancedMode] = useState(false)

    // Initialize form when modal opens
    useEffect(() => {
        if (isOpen && profile) {
            setFormData({ ...profile })
            setAdvancedMode(profile.advancedMode ?? false)
        } else if (isOpen) {
            setFormData({})
            setAdvancedMode(false)
        }
    }, [isOpen, profile])

    const handleChange = (field: keyof CompanyProfile, value: string | boolean) => {
        setFormData(prev => ({ ...prev, [field]: value }))
    }

    const handleControllingEntityChange = (field: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            controllingEntity: {
                name: prev.controllingEntity?.name ?? '',
                cuit: prev.controllingEntity?.cuit ?? '',
                activity: prev.controllingEntity?.activity ?? '',
                address: prev.controllingEntity?.address ?? '',
                [field]: value,
            }
        }))
    }

    const handleSubmit = async () => {
        try {
            await onSave({
                ...formData,
                advancedMode,
            })
            onClose()
        } catch {
            // Error handled by hook
        }
    }

    if (!isOpen) return null

    return (
        <div className="cp-modal-backdrop" onClick={onClose}>
            <div className="cp-modal-panel" onClick={e => e.stopPropagation()}>
                {/* LEFT COLUMN: FORM */}
                <div className="cp-modal-form">
                    {/* Header */}
                    <div className="cp-modal-header">
                        <div className="cp-modal-header-left">
                            <h2 className="cp-modal-title">Ficha de la Empresa</h2>
                            <p className="cp-modal-subtitle">Datos para reportes legales.</p>
                        </div>
                        <div className="cp-modal-header-right">
                            {/* Toggle Switch */}
                            <div className="cp-toggle-container">
                                <span className="cp-toggle-label">Básico</span>
                                <button
                                    type="button"
                                    className={`cp-toggle ${advancedMode ? 'cp-toggle-on' : ''}`}
                                    onClick={() => setAdvancedMode(!advancedMode)}
                                    aria-pressed={advancedMode}
                                >
                                    <span className="cp-toggle-knob" />
                                </button>
                                <span className="cp-toggle-label">Más datos</span>
                            </div>
                            <button className="cp-modal-close" onClick={onClose}>
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Form Content */}
                    <div className="cp-modal-content">
                        {/* Section 1: Identification */}
                        <div className="cp-section">
                            <h3 className="cp-section-title">
                                <IdCard size={18} className="cp-section-icon cp-icon-blue" />
                                Identificación
                            </h3>
                            <div className="cp-form-grid">
                                <div className="cp-form-group cp-col-full">
                                    <label className="cp-label">
                                        Denominación de la Entidad <span className="cp-required">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="cp-input"
                                        placeholder="Ej: Tech Solutions S.R.L."
                                        value={formData.legalName ?? ''}
                                        onChange={e => handleChange('legalName', e.target.value)}
                                    />
                                </div>

                                <div className="cp-form-group">
                                    <label className="cp-label">
                                        CUIT <span className="cp-required">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="cp-input cp-input-mono"
                                        placeholder="30-12345678-9"
                                        value={formData.cuit ?? ''}
                                        onChange={e => handleChange('cuit', e.target.value)}
                                    />
                                </div>

                                <div className="cp-form-group">
                                    <label className="cp-label">Tipo Societario</label>
                                    <select
                                        className="cp-select"
                                        value={formData.legalForm ?? 'S.A.'}
                                        onChange={e => handleChange('legalForm', e.target.value)}
                                    >
                                        {LEGAL_FORMS.map(form => (
                                            <option key={form} value={form}>{form}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="cp-form-group cp-col-full">
                                    <label className="cp-label">
                                        Actividad Principal <span className="cp-required">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="cp-input"
                                        placeholder="Ej: Servicios de informática"
                                        value={formData.mainActivity ?? ''}
                                        onChange={e => handleChange('mainActivity', e.target.value)}
                                    />
                                </div>

                                <div className="cp-form-group cp-col-full">
                                    <label className="cp-label">
                                        Domicilio Legal <span className="cp-required">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="cp-input"
                                        placeholder="Calle, Altura, Localidad"
                                        value={formData.legalAddress ?? ''}
                                        onChange={e => handleChange('legalAddress', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Advanced: Duration & Measure Unit */}
                        {advancedMode && (
                            <div className="cp-section cp-section-advanced">
                                <div className="cp-form-grid">
                                    <div className="cp-form-group">
                                        <label className="cp-label">Duración de la Sociedad</label>
                                        <input
                                            type="text"
                                            className="cp-input"
                                            placeholder="Ej: 99 años"
                                            value={formData.companyDuration ?? ''}
                                            onChange={e => handleChange('companyDuration', e.target.value)}
                                        />
                                    </div>
                                    <div className="cp-form-group">
                                        <label className="cp-label">Unidad de medida</label>
                                        <input
                                            type="text"
                                            className="cp-input"
                                            placeholder="Ej: Pesos Argentinos"
                                            value={formData.measureUnit ?? ''}
                                            onChange={e => handleChange('measureUnit', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Section 2: Fiscal Year */}
                        <div className="cp-section">
                            <h3 className="cp-section-title">
                                <Calendar size={18} className="cp-section-icon cp-icon-green" />
                                Ejercicio Económico
                            </h3>
                            <div className="cp-form-grid">
                                <div className="cp-form-group">
                                    <label className="cp-label">Fecha Inicio</label>
                                    <input
                                        type="date"
                                        className="cp-input"
                                        value={formData.fiscalYearStart ?? ''}
                                        onChange={e => handleChange('fiscalYearStart', e.target.value)}
                                    />
                                </div>
                                <div className="cp-form-group">
                                    <label className="cp-label">Fecha Cierre</label>
                                    <input
                                        type="date"
                                        className="cp-input"
                                        value={formData.fiscalYearEnd ?? ''}
                                        onChange={e => handleChange('fiscalYearEnd', e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Advanced Year Fields */}
                            {advancedMode && (
                                <div className="cp-form-grid cp-mt-3">
                                    <div className="cp-form-group">
                                        <label className="cp-label">Estados contables al</label>
                                        <input
                                            type="date"
                                            className="cp-input"
                                            value={formData.statementsAsOf ?? ''}
                                            onChange={e => handleChange('statementsAsOf', e.target.value)}
                                        />
                                    </div>
                                    <div className="cp-form-group">
                                        <label className="cp-label">Ejercicio Económico N°</label>
                                        <input
                                            type="text"
                                            className="cp-input"
                                            placeholder="Ej: 5"
                                            value={formData.fiscalYearNumber ?? ''}
                                            onChange={e => handleChange('fiscalYearNumber', e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Section 3: Control Body (Advanced) */}
                        {advancedMode && (
                            <div className="cp-section">
                                <h3 className="cp-section-title">
                                    <Landmark size={18} className="cp-section-icon cp-icon-purple" />
                                    Organismo de Control / Registro
                                </h3>
                                <div className="cp-form-grid">
                                    <div className="cp-form-group">
                                        <label className="cp-label">Inscrip. Estatuto</label>
                                        <input
                                            type="date"
                                            className="cp-input"
                                            value={formData.registrationStatuteDate ?? ''}
                                            onChange={e => handleChange('registrationStatuteDate', e.target.value)}
                                        />
                                    </div>
                                    <div className="cp-form-group">
                                        <label className="cp-label">Inscrip. Modificación</label>
                                        <input
                                            type="date"
                                            className="cp-input"
                                            value={formData.registrationModificationDate ?? ''}
                                            onChange={e => handleChange('registrationModificationDate', e.target.value)}
                                        />
                                    </div>
                                    <div className="cp-form-group cp-col-full">
                                        <label className="cp-label">Identificación de Registro (RPC/IGJ)</label>
                                        <input
                                            type="text"
                                            className="cp-input"
                                            placeholder="Ej: Matrícula 1234, Libro 56, Tomo ..."
                                            value={formData.registrationId ?? ''}
                                            onChange={e => handleChange('registrationId', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Section 4: Capital (Read-only info) */}
                        <div className="cp-section">
                            <div className="cp-section-header-row">
                                <h3 className="cp-section-title">
                                    <Building2 size={18} className="cp-section-icon cp-icon-slate" />
                                    Composición del Capital (Automática)
                                </h3>
                            </div>
                            <div className="cp-capital-info">
                                <div className="cp-capital-info-header">
                                    <AlertCircle size={14} />
                                    Se calcula desde el sistema contable (Patrimonio Neto / Capital). Solo lectura.
                                </div>
                                <div className="cp-capital-placeholder">
                                    Los datos de capital se calcularán automáticamente desde la cuenta 3.1.01 (Capital Social) del sistema contable.
                                </div>
                            </div>
                        </div>

                        {/* Section 5: Controlling Entity (Advanced) */}
                        {advancedMode && (
                            <div className="cp-section">
                                <h3 className="cp-section-title">
                                    <Globe size={18} className="cp-section-icon cp-icon-indigo" />
                                    Entidad Controladora
                                </h3>
                                <div className="cp-form-grid">
                                    <div className="cp-form-group cp-col-full">
                                        <label className="cp-label">Denominación</label>
                                        <input
                                            type="text"
                                            className="cp-input"
                                            value={formData.controllingEntity?.name ?? ''}
                                            onChange={e => handleControllingEntityChange('name', e.target.value)}
                                        />
                                    </div>
                                    <div className="cp-form-group">
                                        <label className="cp-label">CUIT</label>
                                        <input
                                            type="text"
                                            className="cp-input cp-input-mono"
                                            value={formData.controllingEntity?.cuit ?? ''}
                                            onChange={e => handleControllingEntityChange('cuit', e.target.value)}
                                        />
                                    </div>
                                    <div className="cp-form-group">
                                        <label className="cp-label">Actividad</label>
                                        <input
                                            type="text"
                                            className="cp-input"
                                            value={formData.controllingEntity?.activity ?? ''}
                                            onChange={e => handleControllingEntityChange('activity', e.target.value)}
                                        />
                                    </div>
                                    <div className="cp-form-group cp-col-full">
                                        <label className="cp-label">Domicilio Legal</label>
                                        <input
                                            type="text"
                                            className="cp-input"
                                            value={formData.controllingEntity?.address ?? ''}
                                            onChange={e => handleControllingEntityChange('address', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Section: Preferences */}
                        <div className="cp-section">
                            <h3 className="cp-section-title">
                                <User size={18} className="cp-section-icon cp-icon-blue" />
                                Preferencias
                            </h3>
                            <div className="cp-form-group">
                                <label className="cp-label">Nombre para Bienvenida</label>
                                <input
                                    type="text"
                                    className="cp-input"
                                    placeholder="Como querés que te llamemos"
                                    value={formData.userName ?? ''}
                                    onChange={e => handleChange('userName', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="cp-modal-footer">
                        <button className="cp-btn cp-btn-secondary" onClick={onClose} disabled={isSaving}>
                            Cancelar
                        </button>
                        <button className="cp-btn cp-btn-primary" onClick={handleSubmit} disabled={isSaving}>
                            {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </div>

                {/* RIGHT COLUMN: PREVIEW */}
                <div className="cp-modal-preview">
                    <div className="cp-preview-header">
                        <span className="cp-preview-label">Vista Previa</span>
                        <div className="cp-preview-toggle">
                            <button className="cp-preview-btn cp-preview-btn-active">
                                <FileText size={14} />
                            </button>
                        </div>
                    </div>

                    {/* PDF Preview Mockup */}
                    <div className="cp-preview-paper">
                        <div className="cp-preview-paper-header" />

                        <div className="cp-preview-name">
                            {formData.legalName || 'NOMBRE ENTIDAD'}
                        </div>

                        <div className="cp-preview-section-title">ESTADOS CONTABLES</div>

                        <div className="cp-preview-grid">
                            <div className="cp-preview-row">
                                <span className="cp-preview-label-text">Domicilio:</span>
                                <span>{formData.legalAddress || '...'}</span>
                            </div>
                            <div className="cp-preview-row">
                                <span className="cp-preview-label-text">Actividad:</span>
                                <span>{formData.mainActivity || '...'}</span>
                            </div>
                            <div className="cp-preview-row">
                                <span className="cp-preview-label-text">CUIT:</span>
                                <span className="cp-preview-mono">{formData.cuit || '...'}</span>
                            </div>
                        </div>

                        <div className="cp-preview-section-title cp-mt-4">CAPITAL</div>
                        <div className="cp-preview-capital-box">
                            <span className="cp-preview-capital-text">Datos del Sistema (Automático)</span>
                        </div>

                        {advancedMode && (
                            <div className="cp-preview-advanced-hint">
                                [+ Secciones Oficiales Adicionales]
                            </div>
                        )}

                        <div className="cp-preview-watermark">Vista Preliminar</div>
                    </div>

                    <p className="cp-preview-footer-text">
                        Así se verá el encabezado en el PDF oficial.
                    </p>
                </div>
            </div>
        </div>
    )
}

export default CompanyProfileModal
