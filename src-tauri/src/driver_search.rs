use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const NVIDIA_SCRIPT: &str = r##"
(function() {
    if (window.self !== window.top) return;
    if (window.__reclaimInjected) return;
    window.__reclaimInjected = true;

    var GPU = "__GPU_NAME__";
    var OS_PREF = "__OS_PREF__";

    function $(sel) { return document.querySelector(sel); }

    function showBanner(text, color) {
        try {
            var el = document.createElement('div');
            el.textContent = text;
            el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:' + color + ';color:white;padding:10px 14px;text-align:center;font:600 13px -apple-system,system-ui,sans-serif;box-shadow:0 2px 12px rgba(0,0,0,0.3)';
            (document.body || document.documentElement).appendChild(el);
            setTimeout(function(){ try { el.style.opacity = '0'; el.style.transition = 'opacity 400ms'; } catch(e){} }, 7000);
            setTimeout(function(){ try { el.remove(); } catch(e) {} }, 7500);
        } catch (e) {}
    }

    function waitFor(check, timeout) {
        timeout = timeout || 15000;
        return new Promise(function(resolve, reject) {
            var start = Date.now();
            var tick = function() {
                try {
                    var r = check();
                    if (r) { resolve(r); return; }
                } catch (e) {}
                if (Date.now() - start > timeout) { reject(new Error('timeout')); return; }
                setTimeout(tick, 200);
            };
            tick();
        });
    }

    function selectByText(selectEl, pattern) {
        if (!selectEl || !selectEl.options) return false;
        var re = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
        for (var i = 0; i < selectEl.options.length; i++) {
            var opt = selectEl.options[i];
            if (re.test(opt.text)) {
                selectEl.value = opt.value;
                selectEl.selectedIndex = i;
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                selectEl.dispatchEvent(new Event('input', { bubbles: true }));
                return opt.text;
            }
        }
        return false;
    }

    function escRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function fill() {
        new Promise(function(resolve) { setTimeout(resolve, 800); }).then(function() {
            return waitFor(function() {
                return $('#selProductSeriesType') || $('select[name*="ProductType" i]');
            }, 15000);
        }).then(function(typeSel) {
            selectByText(typeSel, /^\s*GeForce\s*$/i);

            var seriesMatch = GPU.match(/RTX\s*(\d{2})\d{0,2}/i) || GPU.match(/GTX\s*(\d{2})\d{0,2}/i);
            var familyMatch = GPU.match(/(RTX|GTX)\s*(\d{4}(?:\s+Ti)?(?:\s+Super)?)/i);

            return waitFor(function() {
                var s = $('#selProductSeries');
                return s && s.options.length > 1 ? s : null;
            }, 8000).then(function(seriesSel) {
                if (seriesMatch) {
                    var seriesGroup = (parseInt(seriesMatch[1], 10) * 10).toString();
                    var prefix = GPU.toUpperCase().indexOf('RTX') >= 0 ? 'RTX' : 'GTX';
                    selectByText(seriesSel, new RegExp(prefix + '\\s+' + seriesGroup + '\\s+Series', 'i'));
                }
                return familyMatch;
            }).then(function(familyMatch) {
                return waitFor(function() {
                    var s = $('#selProductFamily');
                    return s && s.options.length > 1 ? s : null;
                }, 8000).then(function(familySel) {
                    if (familyMatch) {
                        var familyName = familyMatch[0].replace(/\s+/g, ' ').trim();
                        if (!selectByText(familySel, new RegExp('^\\s*' + escRegex(familyName) + '\\s*$', 'i'))) {
                            selectByText(familySel, new RegExp(escRegex(familyName), 'i'));
                        }
                    }
                });
            });
        }).then(function() {
            return waitFor(function() { return $('#selOperatingSystem'); }, 5000);
        }).then(function(osSel) {
            if (!selectByText(osSel, new RegExp(escRegex(OS_PREF), 'i'))) {
                selectByText(osSel, /Windows 10 64-bit/i);
            }
            var crdGrdSel = $('#ddlCrdGrd') || $('#selDownloadTypeCrdGrd');
            if (crdGrdSel) selectByText(crdGrdSel, /Game Ready/i);
            var dchSel = $('#ddlDchStd') || $('#selDownloadTypeDch');
            if (dchSel) selectByText(dchSel, /DCH/i);
            return new Promise(function(r) { setTimeout(r, 500); });
        }).then(function() {
            var btn = $('#ManualSearchButton')
                || document.querySelector('a[id*="Search" i]')
                || document.querySelector('input[id*="Search" i]')
                || document.querySelector('button[id*="Search" i]');
            if (btn && btn.click) btn.click();
            showBanner('Reclaim filled your specs — verify the selection and grab the driver.', '#10b981');
        }).catch(function(e) {
            console.warn('Reclaim auto-fill failed:', e);
            showBanner('Could not auto-fill — pick your GPU manually.', '#f59e0b');
        });
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        fill();
    } else {
        document.addEventListener('DOMContentLoaded', fill);
    }
})();
"##;

const SIMPLE_SEARCH_SCRIPT: &str = r##"
(function() {
    if (window.self !== window.top) return;
    if (window.__reclaimInjected) return;
    window.__reclaimInjected = true;

    var GPU = "__GPU_NAME__";

    function showBanner(text, color) {
        try {
            var el = document.createElement('div');
            el.textContent = text;
            el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:' + color + ';color:white;padding:10px 14px;text-align:center;font:600 13px -apple-system,system-ui,sans-serif;box-shadow:0 2px 12px rgba(0,0,0,0.3)';
            (document.body || document.documentElement).appendChild(el);
            setTimeout(function(){ try { el.style.opacity = '0'; el.style.transition = 'opacity 400ms'; } catch(e){} }, 6500);
            setTimeout(function(){ try { el.remove(); } catch(e) {} }, 7000);
        } catch (e) {}
    }

    function pickInput() {
        var candidates = document.querySelectorAll('input[type="search"], input[type="text"][placeholder*="search" i], input[id*="search" i], input[name*="search" i]');
        for (var i = 0; i < candidates.length; i++) {
            var input = candidates[i];
            if (input.offsetWidth > 80 && input.offsetHeight > 12) return input;
        }
        return null;
    }

    function fill() {
        setTimeout(function() {
            var input = pickInput();
            if (!input) {
                showBanner('Type your GPU model into the search box.', '#6366f1');
                return;
            }
            input.focus();
            input.value = GPU;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            showBanner('Reclaim filled in "' + GPU + '" — press Enter to search.', '#10b981');
        }, 1500);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        fill();
    } else {
        document.addEventListener('DOMContentLoaded', fill);
    }
})();
"##;

fn js_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

fn build_script(template: &str, gpu_name: &str, os_pref: &str) -> String {
    template
        .replace("__GPU_NAME__", &js_escape(gpu_name))
        .replace("__OS_PREF__", &js_escape(os_pref))
}

#[tauri::command]
pub async fn open_driver_search(
    app: tauri::AppHandle,
    vendor: String,
    gpu_name: String,
    os_name: String,
) -> Result<(), String> {
    let (url, script): (String, Option<String>) = match vendor.as_str() {
        "nvidia" => (
            "https://www.nvidia.com/Download/index.aspx?lang=en-us".into(),
            Some(build_script(NVIDIA_SCRIPT, &gpu_name, &os_name)),
        ),
        "amd" => (
            format!(
                "https://www.amd.com/en/support/search?searchKeyword={}",
                url_encode(&gpu_name)
            ),
            Some(build_script(SIMPLE_SEARCH_SCRIPT, &gpu_name, &os_name)),
        ),
        "intel" => (
            format!(
                "https://www.intel.com/content/www/us/en/search.html?ws=text#q={}&t=Downloads",
                url_encode(&gpu_name)
            ),
            Some(build_script(SIMPLE_SEARCH_SCRIPT, &gpu_name, &os_name)),
        ),
        other => return Err(format!("Unknown vendor: {}", other)),
    };

    let label = format!("driver-search-{}", vendor);
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.close();
    }

    let parsed = url
        .parse::<tauri::Url>()
        .map_err(|e| format!("Invalid URL: {}", e))?;
    let title = format!("{} driver search", vendor.to_uppercase());
    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title(&title)
        .inner_size(1200.0, 850.0)
        .min_inner_size(900.0, 600.0)
        .decorations(true);

    if let Some(s) = script {
        builder = builder.initialization_script(&s);
    }

    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}
