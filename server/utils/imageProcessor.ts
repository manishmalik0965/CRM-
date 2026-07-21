import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from '../database/connection';

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads', 'email-images');

// Ensure directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Processes HTML content, extracting base64 images, saving them as files,
 * and replacing them with public URLs.
 */
export async function processBase64Images(html: string, baseUrl: string): Promise<string> {
    if (!html) return html;

    // Regex to find base64 images
    const base64Regex = /<img[^>]+src="data:image\/([a-zA-Z]+);base64,([^">]+)"([^>]*)>/g;
    
    let processedHtml = html;
    let match;

    while ((match = base64Regex.exec(html)) !== null) {
        const fullImgTag = match[0];
        const extension = match[1];
        const base64Data = match[2];
        const otherAttributes = match[3];

        try {
            const buffer = Buffer.from(base64Data, 'base64');
            
            // Generate hash to prevent duplicate uploads
            const hash = crypto.createHash('md5').update(buffer).digest('hex');
            const fileName = `${hash}.${extension}`;
            const filePath = path.join(UPLOADS_DIR, fileName);

            // Save file if it doesn't exist
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, buffer);
            }

            // Construct public URL
            // baseUrl should be like 'https://yourdomain.com'
            const publicUrl = `${baseUrl}/uploads/email-images/${fileName}`;
            
            // Replace in HTML
            const newImgTag = `<img src="${publicUrl}"${otherAttributes}>`;
            processedHtml = processedHtml.replace(fullImgTag, newImgTag);
            
            console.log(`[ImageProcessor] Processed base64 image: ${fileName}`);
        } catch (error) {
            console.error('[ImageProcessor] Error processing base64 image:', error);
        }
    }

    return processedHtml;
}

/**
 * Cleanup function to remove unused images by scanning bookings and sent_emails
 */
export async function cleanupUnusedImages() {
    try {
        console.log('[ImageProcessor] Starting cleanup of unused images...');
        
        // 1. Get all image files in the uploads directory
        if (!fs.existsSync(UPLOADS_DIR)) return;
        const files = fs.readdirSync(UPLOADS_DIR);
        if (files.length === 0) return;

        // 2. Query all potentially referencing content from database
        const [bookings]: any = await db.query('SELECT details FROM bookings');
        const [sentEmails]: any = await db.query('SELECT body_html FROM sent_emails');

        // 3. Extract all image names currently in use
        const usedFiles = new Set<string>();
        
        // Helper to find filenames in content
        const findFilenames = (content: string) => {
            if (!content) return;
            const matches = content.match(/\/uploads\/email-images\/([^"'>\s)]+)/g);
            if (matches) {
                matches.forEach(m => {
                    const parts = m.split('/');
                    usedFiles.add(parts[parts.length - 1]);
                });
            }
        };

        bookings.forEach((b: any) => {
            if (b.details) {
                const detailsStr = typeof b.details === 'string' ? b.details : JSON.stringify(b.details);
                findFilenames(detailsStr);
            }
        });

        sentEmails.forEach((e: any) => {
            findFilenames(e.body_html);
        });

        // 4. Delete files not in use
        let deleteCount = 0;
        for (const file of files) {
            if (!usedFiles.has(file)) {
                try {
                    fs.unlinkSync(path.join(UPLOADS_DIR, file));
                    deleteCount++;
                } catch (e) {
                    console.error(`[ImageProcessor] Failed to delete ${file}:`, e);
                }
            }
        }

        console.log(`[ImageProcessor] Cleanup complete. Deleted ${deleteCount} unused images.`);
    } catch (error) {
        console.error('[ImageProcessor] Cleanup error:', error);
    }
}
