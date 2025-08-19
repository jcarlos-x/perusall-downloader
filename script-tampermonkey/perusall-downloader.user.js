// ==UserScript==
// @name         Perusall Document Downloader
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Download Perusall documents as PDF
// @author       xlokius
// @match        https://*.perusall.com/*
// @match        https://perusall.com/*
// @match        https://app.perusall.com/*
// @match        *://perusall.com/*
// @match        *://*.perusall.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Create download button
    function createDownloadButton() {
        const button = document.createElement('button');
        button.id = 'perusall-download-btn';
        button.innerHTML = '📥 Download PDF';
        button.style.cssText = `
            position: fixed !important;
            top: 20px !important;
            right: 20px !important;
            z-index: 999999 !important;
            background: #4CAF50 !important;
            color: white !important;
            border: none !important;
            padding: 12px 24px !important;
            border-radius: 8px !important;
            cursor: pointer !important;
            font-size: 14px !important;
            font-weight: bold !important;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3) !important;
            transition: all 0.3s ease !important;
            font-family: Arial, sans-serif !important;
        `;
        
        button.addEventListener('mouseenter', () => {
            button.style.background = '#45a049 !important';
            button.style.transform = 'scale(1.05)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.background = '#4CAF50 !important';
            button.style.transform = 'scale(1)';
        });
        
        button.addEventListener('click', downloadDocument);
        
        console.log('Download button created');
        return button;
    }

    // Progress indicator
    function createProgressIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'perusall-progress';
        indicator.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: #fff;
            border: 2px solid #4CAF50;
            padding: 15px;
            border-radius: 8px;
            z-index: 9999;
            font-family: Arial, sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            min-width: 250px;
            display: none;
        `;
        document.body.appendChild(indicator);
        return indicator;
    }

    // Update progress
    function updateProgress(message, show = true) {
        const indicator = document.getElementById('perusall-progress');
        if (indicator) {
            indicator.textContent = message;
            indicator.style.display = show ? 'block' : 'none';
        }
        console.log(message);
    }

    // Helper function to wait for elements
    const waitForElement = async (selector, timeout = 10000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const element = document.querySelector(selector);
            if (element) return element;
            await new Promise(r => setTimeout(r, 100));
        }
        return null;
    };

    // Helper function to get page number from URL or data attributes
    const getPageNumber = (img) => {
        const patterns = [
            /page=(\d+)/,
            /page\/(\d+)/,
            /p(\d+)\//,
            /page-(\d+)/,
            /-p(\d+)-/,
            /_(\d+)\.[^.]+$/,
            /\/(\d+)\./,
            /chunk[_-](\d+)/,
            /section[_-](\d+)/,
        ];
        
        for (const pattern of patterns) {
            const match = img.src.match(pattern);
            if (match) {
                return parseInt(match[1]);
            }
        }
        
        const dataAttrs = ['data-page', 'data-page-number', 'page', 'data-index'];
        for (const attr of dataAttrs) {
            const value = img.getAttribute(attr);
            if (value) {
                return parseInt(value);
            }
        }
        
        return null;
    };

    // Detect total pages and collect images (from console script)
    const detectTotalPages = async () => {
        updateProgress('Detecting document structure...');
        
        let len = 0;
        let times = 0;
        const imageMap = new Map(); // Use Map instead of Set to track by URL
        
        // First scroll to top
        window.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 2000));

        return new Promise((resolve) => {
            const interval = setInterval(() => {
                const imgs = document.querySelectorAll('img.chunk');
                if (imgs.length > 0) {
                    // Collect all visible images
                    imgs.forEach((img, index) => {
                        if (img.complete && img.naturalWidth > 0 && !imageMap.has(img.src)) {
                            // Only add if we haven't seen this URL before
                            const image = new Image();
                            image.crossOrigin = 'anonymous'; // Enable CORS
                            image.src = img.src;
                            
                            // Calculate page and position based on order
                            const pageNum = Math.floor(index / 6) + 1;
                            const positionInPage = index % 6;
                            
                            image.dataset.pageNumber = pageNum.toString();
                            image.dataset.position = positionInPage.toString();
                            imageMap.set(img.src, image);
                        }
                    });
                    imgs[imgs.length - 1].scrollIntoView();
                }

                if (len < imgs.length) {
                    len = imgs.length;
                    updateProgress(`Found ${len} image chunks...`);
                } else if (times > 3) {
                    clearInterval(interval);
                    const pages = Math.ceil(len / 6); // Each page has 6 chunks
                    // Convert Map values to array
                    const uniqueImages = Array.from(imageMap.values());
                    console.log(`Found ${uniqueImages.length} unique images out of ${len} total chunks`);
                    updateProgress(`Found ${uniqueImages.length} unique images in ${pages} pages`);
                    resolve({ pages, images: uniqueImages });
                } else {
                    times++;
                }
            }, 2000);
        });
    };

    // Main download function
    async function downloadDocument() {
        if (window.perusallDownloaderRunning) {
            updateProgress('Download already in progress...');
            return;
        }
        
        window.perusallDownloaderRunning = true;
        
        try {
            updateProgress('Starting download process...');
            
            // Ensure jsPDF is loaded
            if (!window.jspdf) {
                updateProgress('Loading jsPDF library...');
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                    script.onload = () => {
                        console.log('jsPDF script loaded');
                        console.log('window.jspdf:', window.jspdf);
                        console.log('window.jsPDF:', window.jsPDF);
                        resolve();
                    };
                    script.onerror = (error) => {
                        console.error('Failed to load jsPDF:', error);
                        reject(error);
                    };
                    document.head.appendChild(script);
                });
                // Wait a bit more for the library to initialize
                await new Promise(r => setTimeout(r, 1000));
            } else {
                console.log('jsPDF already loaded');
                console.log('window.jspdf:', window.jspdf);
                console.log('window.jsPDF:', window.jsPDF);
            }
            
            // Wait for page to load
            await new Promise(r => setTimeout(r, 2000));

            // Detect total pages and collect images
            const result = await detectTotalPages();
            if (!result || !result.pages) {
                throw new Error('Could not detect document pages. Please try again.');
            }

            const expectedPages = result.pages;
            const allImages = result.images;
            
            updateProgress(`Processing ${allImages.length} images from ${expectedPages} pages...`);

            // Convert images to data URLs
            const imageDataPromises = allImages.map(img => {
                return new Promise((resolve, reject) => {
                    const loadAndProcess = () => {
                        try {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            canvas.width = img.naturalWidth || img.width;
                            canvas.height = img.naturalHeight || img.height;
                            ctx.drawImage(img, 0, 0);
                            resolve({
                                dataUrl: canvas.toDataURL('image/jpeg', 0.75),
                                pageNumber: img.dataset.pageNumber,
                                position: parseInt(img.dataset.position) || 0
                            });
                        } catch (error) {
                            reject(error);
                        }
                    };

                    if (img.complete) {
                        loadAndProcess();
                    } else {
                        img.onload = loadAndProcess;
                        img.onerror = () => reject(new Error('Failed to load image'));
                    }
                });
            });

            updateProgress('Converting images to PDF format...');
            const processedImages = await Promise.all(imageDataPromises);

            // Group images by page number and sort by position (from console script)
            const pageGroups = new Map();
            processedImages.forEach(img => {
                const pageNum = parseInt(img.pageNumber) || 1;
                const position = img.position || 0;
                
                if (!pageGroups.has(pageNum)) {
                    pageGroups.set(pageNum, new Array(6).fill(null));
                }
                pageGroups.get(pageNum)[position] = img;
            });

            // Create pages array
            const pages = [];
            const pageNumbers = Array.from(pageGroups.keys()).sort((a, b) => a - b);
            
            pageNumbers.forEach(pageNum => {
                const pageChunks = pageGroups.get(pageNum);
                // Check if page has all chunks
                if (pageChunks.every(chunk => chunk !== null)) {
                    pages.push(pageChunks.map(img => img.dataUrl));
                    console.log(`Added complete page ${pageNum}`);
                } else {
                    const missingPositions = pageChunks
                        .map((chunk, i) => chunk === null ? i : -1)
                        .filter(i => i !== -1);
                    console.warn(`Page ${pageNum} is missing chunks at positions: ${missingPositions.join(', ')}`);
                }
            });

            // Use the organized pages
            console.log(`Using ${pages.length * 6} images organized into ${pages.length} complete pages`);

            updateProgress('Creating PDF document...');

            // Create PDF - try multiple ways to access jsPDF
            let jsPDF;
            if (window.jspdf && window.jspdf.jsPDF) {
                jsPDF = window.jspdf.jsPDF;
            } else if (window.jsPDF) {
                jsPDF = window.jsPDF;
            } else if (typeof window.jspdf === 'function') {
                jsPDF = window.jspdf;
            } else {
                throw new Error('jsPDF library not found. Please reload the page and try again.');
            }

            const doc = new jsPDF({
                orientation: 'p',
                unit: 'pt',
                format: [595.28, 841.89] // A4 size
            });

            // Process each page (from console script)
            pages.forEach((pageChunks, pageIndex) => {
                if (pageIndex > 0) doc.addPage();
                
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                
                // Calculate height for each chunk (divide page height by 6)
                const chunkHeight = pageHeight / 6;
                
                // Add each chunk vertically
                pageChunks.forEach((chunk, index) => {
                    const y = index * chunkHeight;
                    
                    // Add image to fit full width and calculated height
                    doc.addImage(chunk, 'JPEG', 0, y, pageWidth, chunkHeight, '', 'FAST');
                });
                
                updateProgress(`Processing page ${pageIndex + 1}/${pages.length}...`);
            });

            // Get document title (from console script)
            const title = (
                document.querySelector('h1.p-title')?.textContent?.trim() || // Try Perusall title class
                document.querySelector('.p-title')?.textContent?.trim() || // Try without h1
                document.querySelector('h1')?.textContent?.trim() || // Try any h1
                document.querySelector('title')?.textContent?.trim() || // Try page title
                'perusall_article' // Default title
            ).replace(/[^a-z0-9]/gi, '_').toLowerCase(); // Clean the title

            updateProgress('Saving PDF file...');
            console.log('Saving PDF...');
            doc.save(title + '.pdf');
            
            updateProgress('✅ Download completed successfully!');
            setTimeout(() => updateProgress('', false), 3000);
            
        } catch (error) {
            console.error('Download error:', error);
            updateProgress('❌ Error: ' + error.message);
            setTimeout(() => updateProgress('', false), 5000);
        } finally {
            window.perusallDownloaderRunning = false;
        }
    }

    // Initialize script when page loads
    function initialize() {
        console.log('Perusall Downloader: Initializing...');
        
        // Remove existing button if present
        const existingButton = document.getElementById('perusall-download-btn');
        if (existingButton) {
            existingButton.remove();
        }
        
        // Wait for page to fully load
        setTimeout(() => {
            console.log('Perusall Downloader: Checking for images...');
            
            // Look for chunk images first (like console script)
            const chunkImages = document.querySelectorAll('img.chunk');
            const allImages = document.querySelectorAll('img');
            const totalImages = allImages.length;
            
            // Check for CloudFront chunks as fallback
            const cloudFrontImages = Array.from(allImages).filter(img => 
                img.src.includes('d12klv9dmumy6j.cloudfront.net/chunks/')
            );
            
            console.log('Total images:', totalImages);
            console.log('Chunk images (.chunk):', chunkImages.length);
            console.log('CloudFront chunks found:', cloudFrontImages.length);
            
            // Create button always
            const button = createDownloadButton();
            document.body.appendChild(button);
            createProgressIndicator();
            
            // Consider it a document if we have chunk images OR CloudFront chunks
            const hasDocument = chunkImages.length > 0 || cloudFrontImages.length > 0;
            
            if (hasDocument) {
                console.log('Perusall Downloader: Document detected - Ready to download');
                console.log('Using chunk images:', chunkImages.length > 0 ? 'Yes' : 'No');
                console.log('Using CloudFront images:', cloudFrontImages.length > 0 ? 'Yes' : 'No');
                button.innerHTML = '📥 Download PDF';
                button.style.background = '#4CAF50 !important';
            } else {
                console.log('Perusall Downloader: No document detected');
                button.innerHTML = '⚠️ No Document';
                button.style.background = '#ff9800 !important';
            }
        }, 1000);
    }

    // Start when DOM is ready
    console.log('Perusall Downloader: Script loaded');
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    // Also initialize on URL changes (for SPAs)
    let currentUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== currentUrl) {
            currentUrl = location.href;
            console.log('URL changed, reinitializing...');
            setTimeout(initialize, 1000);
        }
    }).observe(document, { subtree: true, childList: true });

    // Force initialization after a delay (fallback)
    setTimeout(() => {
        console.log('Fallback initialization...');
        if (!document.getElementById('perusall-download-btn')) {
            initialize();
        }
    }, 3000);

})();