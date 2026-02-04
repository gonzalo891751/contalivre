/**
 * Company Profile Types
 * Single source of truth for company data across UI, Estados Contables, and PDFs
 */

/**
 * Controlling entity information (optional)
 */
export interface ControllingEntity {
    name: string
    cuit: string
    activity: string
    address: string
}

/**
 * Capital metadata for automatic composition calculation
 * This is NOT manual input - just configuration for the automatic calculation
 */
export interface CapitalMeta {
    /** Nominal value per share (e.g., $100) */
    nominalValue?: number
    /** Share class (e.g., "Ordinarias Nominativas") */
    shareClass?: string
    /** Votes per share */
    votesPerShare?: number
    /** Custom capital account code if not using default 3.1.01 */
    capitalAccountCode?: string
}

/**
 * Computed capital composition (read-only, derived from ledger)
 */
export interface CapitalComposition {
    circulation: {
        qty: number
        class: string
        nominal: number
        subscribed: number
        registered: number
        integrated: number
    }
    portfolio: {
        qty: number
        class: string
        nominal: number
        subscribed: number
        registered: number
        integrated: number
    }
}

/**
 * Company Profile - Main interface
 * Singleton record stored with id='default'
 */
export interface CompanyProfile {
    id: string // Always 'default'

    // ==========================================
    // Basic Fields (always visible)
    // ==========================================

    /** Legal name / Denominación de la Entidad (required for PDF) */
    legalName: string
    /** CUIT number (required for PDF) */
    cuit: string
    /** Legal form type: S.A., S.R.L., S.A.S., Unipersonal */
    legalForm?: 'S.A.' | 'S.R.L.' | 'S.A.S.' | 'Unipersonal'
    /** Main business activity / Actividad Principal */
    mainActivity?: string
    /** Legal address / Domicilio Legal */
    legalAddress?: string
    /** Fiscal year start date (ISO format YYYY-MM-DD) */
    fiscalYearStart?: string
    /** Fiscal year end date (ISO format YYYY-MM-DD) */
    fiscalYearEnd?: string
    /** User name for greeting / Nombre para Bienvenida */
    userName?: string

    // ==========================================
    // Advanced Mode Toggle
    // ==========================================

    /** Show advanced fields */
    advancedMode?: boolean

    // ==========================================
    // Advanced Fields (visible when advancedMode=true)
    // ==========================================

    /** Company duration / Duración de la Sociedad */
    companyDuration?: string
    /** Measurement unit / Unidad de medida */
    measureUnit?: string
    /** Statements as of date (ISO format) */
    statementsAsOf?: string
    /** Fiscal year number / Ejercicio Económico N° */
    fiscalYearNumber?: string
    /** Registration statute date (ISO format) */
    registrationStatuteDate?: string
    /** Registration modification date (ISO format) */
    registrationModificationDate?: string
    /** Registration ID / Identificación de Registro (RPC/IGJ) */
    registrationId?: string

    // ==========================================
    // Controlling Entity (Advanced)
    // ==========================================

    /** Parent/controlling company info */
    controllingEntity?: ControllingEntity

    // ==========================================
    // Capital Metadata (for automatic calculation)
    // ==========================================

    /** Metadata for capital composition calculation */
    capitalMeta?: CapitalMeta

    // ==========================================
    // Timestamps
    // ==========================================

    createdAt?: string
    updatedAt?: string
}

/**
 * Create an empty company profile
 */
export function createEmptyCompanyProfile(): CompanyProfile {
    return {
        id: 'default',
        legalName: '',
        cuit: '',
    }
}

/**
 * Check if profile has minimum required data for official documents
 */
export function isProfileConfigured(profile: CompanyProfile | null | undefined): boolean {
    return !!(profile?.legalName && profile?.cuit)
}
