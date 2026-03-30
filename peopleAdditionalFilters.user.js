// ==UserScript==
// @name          Canvas People Additional Filters
// @description   Replaces the Canvas filter controls, allowing for filter option expansion
// @match         https://*.instructure.com/*
// @version       0.8a
// @updateURL     https://raw.githubusercontent.com/cesbrandt/canvas-javascript-peopleAdditionalFilters/master/peopleAdditionalFilters.user.js
// ==/UserScript==

window.addEventListener('load', () => {
    console.log("🛠️ Custom Roster Script Loaded. Listening for navigations...");

    async function initRosterHijack() {
        const currentPath = window.location.pathname;
        const pathMatch = currentPath.match(/^\/courses\/(\d+)\/users[^\/]*$/);
        if (!pathMatch) return;

        const courseId = pathMatch[1];

        if (document.getElementById('btn-advanced-filters') || document.getElementById('customDomSearch')) return;

        // 1. API Gate: Check for multiple sections (Requesting only 2 for speed)
        try {
            const sectionCheck = await fetch(`/api/v1/courses/${courseId}/sections?per_page=2`, {
                headers: { 'Accept': 'application/json' }
            });
            const sections = await sectionCheck.json();

            if (sections.length <= 1) {
                console.log("🛠️ Single section course detected. Advanced filters bypassed.");
                return; // Exit silently, leaving native UI alone
            }
        } catch (error) {
            console.error("🛠️ Failed to check course sections:", error);
            return; // Fail gracefully if API is down
        }

        const nativeSearch = document.querySelector('[id="search_input_container"]');
        if (!nativeSearch) return;

        // 2. Inject the Native-Styled Opt-In Toggle Button
        const nativeFilterRow = nativeSearch.parentNode;

        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'btn-advanced-filters';
        toggleBtn.innerText = 'Use Advanced Filters';
        // Use Canvas native classes, plus flexbox auto-margin for right alignment
        toggleBtn.className = 'btn btn-primary';
        toggleBtn.style.marginLeft = 'auto';
        toggleBtn.style.maxHeight = '42px';

        nativeFilterRow.appendChild(toggleBtn);

        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            executeExtraction(nativeFilterRow);
        });
    }

    function executeExtraction(nativeFilterRow) {
        const scrollContainer = document.getElementById('drawer-layout-content');
        if (!scrollContainer) return;

        console.log("🛠️ Starting forced load of native roster...");

        const overlay = document.createElement('div');
        overlay.id = 'roster-hijack-overlay';
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(255, 255, 255, 0.95); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: var(--ic-font-family);';

        overlay.innerHTML = `
            <div style="width: 50px; height: 50px; border: 4px solid #c7cdd1; border-top: 4px solid #008ee2; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
            <h2 style="color: #2d3b45; margin: 0 0 10px 0;">Loading Advanced Filters</h2>
            <p id="overlay-status-text" style="color: #556572; font-size: 16px;">Extracting complete roster data...</p>
        `;
        document.body.appendChild(overlay);
        const statusText = document.getElementById('overlay-status-text');

        const origHeight = scrollContainer.style.height;
        const origMaxHeight = scrollContainer.style.maxHeight;

        let lastRowCount = 0;
        let unchangedCycles = 0;

        const scrollInterval = setInterval(() => {
            scrollContainer.style.height = '100px';
            scrollContainer.style.maxHeight = '100px';

            requestAnimationFrame(() => {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
                scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));

                const loadingIndicator = document.querySelector('.paginatedLoadingIndicator');
                const isNativeLoading = loadingIndicator && loadingIndicator.style.display !== 'none';

                const currentRowCount = document.querySelectorAll('[data-view="users"] .collectionViewItems > tr').length;
                statusText.innerText = `Extracting complete roster data... Found ${currentRowCount} users.`;

                if (currentRowCount > lastRowCount) {
                    lastRowCount = currentRowCount;
                    unchangedCycles = 0;
                } else if (!isNativeLoading) {
                    unchangedCycles++;
                } else {
                    unchangedCycles = 0;
                }

                if (unchangedCycles >= 4) {
                    clearInterval(scrollInterval);
                    scrollContainer.scrollTop = 0;
                    finishLoading();
                }
            });
        }, 600);

        function finishLoading() {
            console.log(`🛠️ Roster fully loaded with ${lastRowCount} users. Hijacking UI...`);

            scrollContainer.style.height = origHeight;
            scrollContainer.style.maxHeight = origMaxHeight;
            overlay.remove();

            buildAndInjectCustomUI(nativeFilterRow);
        }
    }

    function buildAndInjectCustomUI(nativeFilterRow) {
        nativeFilterRow.style.display = 'none';

        const allRows = Array.from(document.querySelectorAll('[data-view="users"] .collectionViewItems > tr'));

        const sectionsSet = new Set();
        const rolesSet = new Set();

        const rowData = allRows.map(row => {
            const userSections = [];
            const sectionCells = row.querySelectorAll('[data-testid="section-column-cell"] .section');
            sectionCells.forEach(s => {
                const text = s.textContent.trim();
                userSections.push(text);
                sectionsSet.add(text);
            });

            const userRoles = [];
            const sectionTd = row.querySelector('[data-testid="section-column-cell"]');
            if (sectionTd && sectionTd.nextElementSibling) {
                const roleDivs = sectionTd.nextElementSibling.querySelectorAll('div');
                roleDivs.forEach(r => {
                    const text = r.textContent.trim();
                    userRoles.push(text);
                    rolesSet.add(text);
                });
            }

            return {
                element: row,
                searchText: row.textContent.toLowerCase(),
                sections: userSections,
                roles: userRoles
            };
        });

        const customFilterBar = document.createElement('div');
        customFilterBar.style.cssText = 'display: flex; gap: 10px; margin-bottom: 20px; align-items: center; padding: 15px; background: #f5f5f5; border: 1px solid #c7cdd1; border-radius: 4px;';

        const sectionOpts = Array.from(sectionsSet).map(s => `<option value="${s}">${s}</option>`).join('');
        const roleOpts = Array.from(rolesSet).map(r => `<option value="${r}">${r}</option>`).join('');

        customFilterBar.innerHTML = `
            <input type="text" id="customDomSearch" placeholder="Search by name, ID, etc..." style="padding: 8px; border: 1px solid #c7cdd1; border-radius: 4px; flex-grow: 1; max-width: 400px;">
            <select id="customDomRole" style="padding: 8px; border: 1px solid #c7cdd1; border-radius: 4px;">
                <option value="all">All Roles</option>
                ${roleOpts}
            </select>
            <select id="customDomSection" style="padding: 8px; border: 1px solid #c7cdd1; border-radius: 4px;">
                <option value="all">All Sections</option>
                ${sectionOpts}
            </select>
            <span id="customDomCount" style="margin-left: auto; font-size: 14px; color: #2d3b45; font-weight: bold;">
                Showing ${allRows.length} Users
            </span>
        `;

        nativeFilterRow.parentNode.insertBefore(customFilterBar, nativeFilterRow.nextSibling);

        const searchInput = document.getElementById('customDomSearch');
        const roleSelect = document.getElementById('customDomRole');
        const sectionSelect = document.getElementById('customDomSection');
        const countDisplay = document.getElementById('customDomCount');

        function applyFilters() {
            const term = searchInput.value.toLowerCase();
            const roleFilter = roleSelect.value;
            const sectionFilter = sectionSelect.value;

            let visibleCount = 0;
            let crossFilteredRoleCount = 0;
            let crossFilteredSectionCount = 0;

            const visibleRoles = {};
            const visibleSections = {};
            Array.from(rolesSet).forEach(r => visibleRoles[r] = 0);
            Array.from(sectionsSet).forEach(s => visibleSections[s] = 0);

            rowData.forEach(data => {
                const matchesSearch = !term || data.searchText.includes(term);
                const matchesSection = sectionFilter === 'all' || data.sections.includes(sectionFilter);
                const matchesRole = roleFilter === 'all' || data.roles.includes(roleFilter);

                if (matchesSearch && matchesSection && matchesRole) {
                    data.element.style.display = '';
                    visibleCount++;
                } else {
                    data.element.style.display = 'none';
                }

                if (matchesSearch && matchesSection) {
                    crossFilteredRoleCount++;
                    data.roles.forEach(r => visibleRoles[r]++);
                }

                if (matchesSearch && matchesRole) {
                    crossFilteredSectionCount++;
                    data.sections.forEach(s => visibleSections[s]++);
                }
            });

            countDisplay.innerText = `Showing ${visibleCount} Users`;

            Array.from(roleSelect.options).forEach(opt => {
                if (opt.value === 'all') opt.text = `All Roles (${crossFilteredRoleCount})`;
                else opt.text = `${opt.value} (${visibleRoles[opt.value]})`;
            });

            Array.from(sectionSelect.options).forEach(opt => {
                if (opt.value === 'all') opt.text = `All Sections (${crossFilteredSectionCount})`;
                else opt.text = `${opt.value} (${visibleSections[opt.value]})`;
            });
        }

        searchInput.addEventListener('input', applyFilters);
        roleSelect.addEventListener('change', applyFilters);
        sectionSelect.addEventListener('change', applyFilters);
        applyFilters();
    }

    // --- SPA ROUTING HOOKS ---
    initRosterHijack();

    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        // Slightly longer timeout to allow React to mount the search bar before we look for it
        setTimeout(initRosterHijack, 800);
    };

    window.addEventListener('popstate', () => {
        setTimeout(initRosterHijack, 800);
    });
});
