
/**
 * Exports an HTML element to a PDF file.
 * @param element The HTML element to capture.
 * @param filename The name of the output PDF file (without extension).
 */
export async function exportElementToPdf(element: HTMLElement, filename: string): Promise<void> {
    try {
        const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
            import('html2canvas'),
            import('jspdf')
        ])

        // High scale for better quality
        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        })

        const imgData = canvas.toDataURL('image/png')

        // Calculate dimensions to fit A4
        const imgWidth = 210 // A4 width in mm
        const pageHeight = 297 // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width

        // Determine orientation
        const orientation = imgHeight > pageHeight ? 'p' : 'p' // Default to portrait, let styling handle aspect ratio
        // Actually, if content is very wide, maybe landscape? But standard A4 is usually preferred.
        // Let's stick to fitting width to A4 width.

        const pdf = new jsPDF(orientation, 'mm', 'a4')

        // Add image
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)

        // Save
        pdf.save(`${filename}.pdf`)

    } catch (error) {
        console.error('Error generating PDF:', error)
        alert('Hubo un error al generar el PDF. Por favor intentá nuevamente.')
    }
}
