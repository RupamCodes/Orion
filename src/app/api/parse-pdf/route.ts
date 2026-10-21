import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Use pdf-parse in Node runtime
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);

    // Clean up extracted text
    let cleanText = data.text || '';
    
    // Normalize newlines, remove redundant spaces
    cleanText = cleanText
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return NextResponse.json({
      text: cleanText,
      numPages: data.numpages || 1,
      info: data.info || {}
    });
  } catch (error: any) {
    console.error('PDF parsing server error:', error);
    return NextResponse.json(
      { error: 'Failed to extract text from PDF: ' + (error.message || error) },
      { status: 500 }
    );
  }
}
