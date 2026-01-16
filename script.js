document.addEventListener("DOMContentLoaded", () => {
    // 1. Initialize PDF.js worker
    // This is required to read the text content of PDF files
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    // --- CONFIGURATION ---
    // LIMITS: Adjust these numbers to control how much content is shown
    const MAX_KEYWORDS = 6;
    const MAX_SUGGESTIONS = 3; 

    // --- HELPER FUNCTIONS ---

    // Helper: Extract clean text from PDF or Text file
    async function getFileText(file) {
        if (file.type === "application/pdf") {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            let fullText = "";
            
            // Loop through all pages to extract text
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(" ");
                fullText += pageText + "\n";
            }
            return fullText;
        } else {
            // Fallback for .txt files
            return await file.text();
        }
    }

    // Helper: Clean and Parse JSON (Fixes "Bad control character" errors)
    function safeJSONParse(jsonString) {
        // 1. Remove Markdown code blocks (e.g. ```json ... ```)
        let clean = jsonString.replace(/```json|```/g, '').trim();
        
        // 2. Try parsing directly
        try {
            return JSON.parse(clean);
        } catch (e) {
            // 3. If that fails, sanitize control characters (newlines/tabs inside strings)
            console.warn("Standard parse failed, attempting sanitation...");
            clean = clean.replace(/[\n\r\t]/g, ' '); 
            return JSON.parse(clean);
        }
    }

    // --- MAIN ANALYSIS FUNCTION ---

    async function performRealAnalysis(jd, resumeFile) {
        // !!! PASTE YOUR REAL API KEY HERE !!!
        const apiKey = "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"; 
        
        const jdStatus = document.getElementById('jdStatus');
        const loadingContent = document.getElementById('loadingContent');
        const resultsContent = document.getElementById('resultsContent');
        const initialContent = document.getElementById('initialContent');

        try {
            // Step 1: Read the Resume
            jdStatus.textContent = "Reading PDF...";
            const resumeText = await getFileText(resumeFile);
            
            // Step 2: Prepare the Prompt
            jdStatus.textContent = "Processing API...";
            
            // Note: We explicitly ask for 'suggestions' as an Array of Strings now
            const promptContent = `You are an ATS Scanner. Compare the Resume to the Job Description. 
            Return a valid JSON object. Do not use Markdown.
            
            Format:
            {
              "score": number (0-100),
              "missingKeywords": ["keyword1", "keyword2", "keyword3"],
              "suggestions": ["specific actionable tip 1 ", "specific actionable tip 2", "specific actionable tip 3"] (keep suggestion short and to the point also  donot use special characters,you can use font weights)
            }

            JOB DESCRIPTION:
            ${jd}
            
            RESUME TEXT:
            ${resumeText}`;

            // Step 3: Call the API
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": window.location.href,
                    "X-Title": "ATS Analyzer"
                },
                body: JSON.stringify({
                    model: "mistralai/mistral-small-creative", 
                    messages: [{
                        role: "user",
                        content: promptContent 
                    }]
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(`API Error ${response.status}: ${errData.error?.message || 'Check API Key'}`);
            }

            // Step 4: Parse Response
            const data = await response.json();
            const result = safeJSONParse(data.choices[0].message.content);

            // --- UPDATE UI WITH RESULTS ---
            
            // A. Update Score
            document.getElementById('atsScore').innerText = `${result.score}%`;
            
            // B. Update Keywords (Limited to MAX_KEYWORDS)
            const keywordList = document.getElementById('missingKeywords');
            keywordList.innerHTML = "";
            if(result.missingKeywords && Array.isArray(result.missingKeywords)) {
                // Slice array to the limit
                result.missingKeywords.slice(0, MAX_KEYWORDS).forEach(kw => {
                    const li = document.createElement('li');
                    li.innerText = kw;
                    keywordList.appendChild(li);
                });
            }

            // C. Update Suggestions (Limited to MAX_SUGGESTIONS & Bulleted)
            // C. Update Suggestions (Limited to MAX_SUGGESTIONS & Bulleted)
    const suggestionsContainer = document.getElementById('suggestionsText');
    suggestionsContainer.innerHTML = ""; // Clear previous

    if (result.suggestions && Array.isArray(result.suggestions)) {
        result.suggestions.slice(0, MAX_SUGGESTIONS).forEach(tip => {
            const li = document.createElement('li');
            
            // --- THIS PART FIXES THE BOLDING ---
            // It looks for **text** and replaces it with <b>text</b>
            const formattedTip = tip.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
            li.innerHTML = formattedTip; 
            // ------------------------------------

            li.style.marginBottom = "8px"; 
            suggestionsContainer.appendChild(li);
        });
    } else if (typeof result.suggestions === 'string') {
                // Fallback if AI returns a single string
                const li = document.createElement('li');
                li.innerText = result.suggestions;
                suggestionsContainer.appendChild(li);
            }

            jdStatus.textContent = "Analysis Complete";

            // Step 5: Toggle Views (Hide Loading -> Show Results)
            loadingContent.classList.add('hidden');
            resultsContent.classList.remove('hidden');

        } catch (error) {
            console.error("Full Error Details:", error);
            alert(`Analysis Failed: ${error.message}`);
            jdStatus.textContent = "Error";
            
            // Reset View on Error
            loadingContent.classList.add('hidden');
            initialContent.classList.remove('hidden');
        }
    }

    // --- EVENT LISTENERS ---

    document.getElementById('analyzeBtn').addEventListener('click', function() {
        const jd = document.getElementById('jdInput').value;
        const resume = document.getElementById('resumeInput').files[0];

        // Validation
        if (!jd || !resume) {
            alert("Please provide both a Job Description and a Resume.");
            return;
        }

        // UI State: Hide Initial -> Show Loading
        document.getElementById('initialContent').classList.add('hidden');
        document.getElementById('resultsContent').classList.add('hidden'); // Ensure results are hidden
        document.getElementById('loadingContent').classList.remove('hidden'); // Show spinner

        // Start Analysis
        performRealAnalysis(jd, resume);
    });

    // Helper: Character Count & Status
    const jdInput = document.getElementById('jdInput');
    const charCount = document.getElementById('charCount');
    const clearBtn = document.getElementById('clearJd');
    const jdStatus = document.getElementById('jdStatus');

    jdInput.addEventListener('input', () => {
        const length = jdInput.value.length;
        charCount.textContent = `${length} / 5000 characters`;
        if (length > 100) {
            jdStatus.textContent = "Ready to Analyze";
            jdStatus.style.color = "#4f46e5"; 
        } else {
             jdStatus.textContent = "Waiting for input...";
        }
    });

    // Helper: Clear Button
    clearBtn.addEventListener('click', () => {
        jdInput.value = "";
        charCount.textContent = "0 / 5000 characters";
    });
});