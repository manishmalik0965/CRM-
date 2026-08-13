import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from '../database/connection';

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads', 'email-images');

// Ensure directory exists as fallback/local compatibility
try {
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
} catch (e) {
    console.warn('[ImageProcessor] Could not create local uploads directory (expected in serverless environments):', e);
}

/**
 * Processes HTML content, extracting base64 images, saving them as database records,
 * and replacing them with public URLs.
 */
export async function processBase64Images(html: string, baseUrl: string): Promise<string> {
    if (!html) return html;

    // Regex to find data:image base64 strings in src attributes (single or double quotes)
    const base64Regex = /src=["'](data:image\/([a-zA-Z0-9+-]+);base64,([^"']+))["']/gi;
    
    let processedHtml = html;
    let match;

    while ((match = base64Regex.exec(html)) !== null) {
        const fullDataUrl = match[1];
        const rawExtension = match[2];
        const base64Data = match[3];

        try {
            const extension = rawExtension.toLowerCase().replace('jpeg', 'jpg').split('+')[0] || 'png';
            const buffer = Buffer.from(base64Data, 'base64');
            
            // Generate hash to prevent duplicate uploads
            const hash = crypto.createHash('md5').update(buffer).digest('hex');
            const fileName = `${hash}.${extension}`;
            const filePath = path.join(UPLOADS_DIR, fileName);

            // 1. Try to save file to database permanently (stateless cloud-native strategy)
            let databaseSaved = false;
            try {
                const contentType = `image/${extension}`;
                // Using INSERT IGNORE (or ON DUPLICATE KEY UPDATE) to handle duplicate hashes gracefully
                await db.query(
                    'INSERT INTO uploaded_files (id, content_type, buffer) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE content_type=VALUES(content_type)',
                    [hash, contentType, buffer]
                );
                databaseSaved = true;
            } catch (dbErr) {
                console.warn('[ImageProcessor] Database write failed, falling back to disk:', dbErr);
            }

            // 2. If database save succeeded, point to dynamic database route. Otherwise fallback to file route.
            let publicUrl = '';
            if (databaseSaved) {
                publicUrl = `${baseUrl}/api/v/snapshot/${hash}.php`;
                console.log(`[ImageProcessor] Processed base64 image (saved to DB): ${hash}`);
            } else {
                // Save file locally as fallback
                try {
                    if (fs.existsSync(UPLOADS_DIR) && !fs.existsSync(filePath)) {
                        fs.writeFileSync(filePath, buffer);
                    }
                    publicUrl = `${baseUrl}/uploads/email-images/${fileName}`;
                    console.log(`[ImageProcessor] Processed base64 image (saved to local disk): ${fileName}`);
                } catch (fsErr) {
                    console.error('[ImageProcessor] Local disk write fallback failed:', fsErr);
                    // Point to database route anyway hoping it recovers or let next CID fallback block handle it
                    publicUrl = `${baseUrl}/api/v/snapshot/${hash}.php`;
                }
            }
            
            // Replace full data URL with public URL
            processedHtml = processedHtml.replace(fullDataUrl, publicUrl);
        } catch (error) {
            console.error('[ImageProcessor] Error processing base64 image:', error);
        }
    }

    return processedHtml;
}

/**
 * Cleanup function to remove unused images
 */
export async function cleanupUnusedImages() {
    try {
        console.log('[ImageProcessor] Starting cleanup of unused images...');
        
        // 1. Clean local files if they exist
        if (fs.existsSync(UPLOADS_DIR)) {
            const files = fs.readdirSync(UPLOADS_DIR);
            if (files.length > 0) {
                // Query all potentially referencing content from database
                const [bookings]: any = await db.query('SELECT details FROM bookings');
                const [sentEmails]: any = await db.query('SELECT body_html FROM sent_emails');

                // Extract all image names currently in use
                const usedFiles = new Set<string>();
                
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

                // Delete local files not in use
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
                console.log(`[ImageProcessor] Local cleanup complete. Deleted ${deleteCount} unused images.`);
            }
        }
    } catch (error) {
        console.error('[ImageProcessor] Cleanup error:', error);
    }
}
