// ===== Frontend JS with Authentication (MERGED) =====

// Auth state management
let currentUser = null;
let authToken = null;

// API helper with authentication
const API = {
  async request(path, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    };

    try {
      const response = await fetch(path, { ...options, headers });
      
      // Handle auth errors
      if (response.status === 401) {
        this.handleAuthError();
        throw new Error('Authentication required');
      }
      
      if (!response.ok) {
        let errorMsg = `HTTP ${response.status} ${response.statusText || 'Request failed'}`;
        try {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMsg = errorData.message || errorData.error || errorMsg;
          } else {
            const text = await response.text();
            if (text && text.trim()) {
              errorMsg = text.length > 200 ? text.slice(0, 200) + '...' : text;
            }
          }
        } catch (_) {
          // fallback to status message
        }
        throw new Error(errorMsg);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  },

  async get(path) { 
    return this.request(path); 
  },
  
  async post(path, body) { 
    return this.request(path, {
      method: 'POST',
      body: JSON.stringify(body)
    }); 
  },
  
  async put(path, body) { 
    return this.request(path, {
      method: 'PUT',
      body: JSON.stringify(body)
    }); 
  },
  
  async del(path) { 
    return this.request(path, { method: 'DELETE' }); 
  },

  handleAuthError() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/';
  }
};

// Utility functions
function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function fmtINR(n){ 
  try{ 
    return new Intl.NumberFormat('en-IN',{
      style:'currency',
      currency:'INR',
      maximumFractionDigits:2
    }).format(n); 
  }catch(_){ 
    return '₹'+Number(n||0).toFixed(2);
  } 
}

function daysUntil(dateStr){
  if(!dateStr) return Number.POSITIVE_INFINITY;
  const d = new Date(dateStr + 'T00:00:00Z');
  const today = new Date();
  today.setUTCHours(0,0,0,0);
  const diff = d - today;
  return Math.ceil(diff/86400000);
}

// ---- Auth Functions (MODIFIED/ADDED) ----
function getInitials(name) {
    if (!name) return '';
    const names = name.split(' ');
    return names.length > 1 ? names[0][0] + names[names.length - 1][0] : name[0];
}

// Replaces the old updateUserInfo
function updateAllUserInfoDisplays() {
  if (!currentUser) return;

  // Update original sidebar user info
  $all('.user-name').forEach(el => el.textContent = currentUser.name);
  $all('.user-company').forEach(el => el.textContent = currentUser.company);

  // Update welcome message
  const welcomeEl = $('.welcome-message');
  if (welcomeEl) {
    welcomeEl.textContent = `Welcome back, ${currentUser.name}!`;
  }
  
  // Update the new profile sidebar and trigger icon
  const initials = getInitials(currentUser.name).toUpperCase();

  const userInitialsEl = $('#userInitials');
  const profileInitialsEl = $('#profileInitials');
  const profileNameEl = $('#profileName');
  const profileEmailEl = $('#profileEmail');
  const profileCompanyEl = $('#profileCompany');

  if(userInitialsEl) userInitialsEl.textContent = initials;
  if(profileInitialsEl) profileInitialsEl.textContent = initials;
  if(profileNameEl) profileNameEl.textContent = currentUser.name;
  if(profileEmailEl) profileEmailEl.textContent = currentUser.email;
  if(profileCompanyEl) profileCompanyEl.textContent = currentUser.company;
}

function checkAuth() {
  const token = localStorage.getItem('authToken');
  const user = localStorage.getItem('user');
  
  if (!token || !user) {
    window.location.href = '/';
    return false;
  }
  
  try {
    currentUser = JSON.parse(user);
    authToken = token;
    // Call the new unified function
    updateAllUserInfoDisplays();
    return true;
  } catch (error) {
    console.error('Invalid user data:', error);
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/';
    return false;
  }
}

function logout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/';
  }
}

// ---- General UI Functions ----
function startClock(){
  const el = $('#clock');
  if (el) {
    const updateClock = () => {
      el.textContent = new Date().toLocaleString('en-IN');
    };
    updateClock(); // Initial update
    setInterval(updateClock, 1000);
  }
}

function markActive(){
  $all('.menu li a').forEach(a => {
    const file = location.pathname.split('/').pop() || 'dashboard.html';
    if(a.getAttribute('href')?.endsWith(file)) {
      a.parentElement.classList.add('active');
    }
  });
}

// CORRECTED updateNotifications function to handle API response {alerts: [...]}
async function updateNotifications(){
  try {
    const data = await API.get('/api/alerts'); // data is {alerts: [...]}
    const alerts = data.alerts || [];          // Extract the array
    const count = alerts.length;               // Now length is correct
    
    const bellCount = $('#notificationCount');
    if(bellCount) {
      bellCount.textContent = count;
      bellCount.style.display = count > 0 ? 'flex' : 'none';
    }
  } catch (error) {
    console.error('Failed to update notifications:', error);
    const bellCount = $('#notificationCount');
    if(bellCount) bellCount.style.display = 'none'; 
  }
}

// ---- Page Initialization Functions ----
async function initDashboard(){
  try {
    const m = await API.get('/api/metrics');
    const set = (id,val)=>{ 
      const el=document.getElementById(id); 
      if(el) el.textContent = val; 
    };
    
    set('totalProducts', m.totalProducts);
    set('safeProducts', m.safe);
    set('soonExpire', m.soon);
    set('expired', m.expired);
    set('lowStock', m.low);
    set('recentAdded', m.recent);
    set('dispatchReady', m.dispatchReady);
    set('inventoryValue', fmtINR(m.value));

  } catch (error) {
    console.error('Failed to initialize dashboard:', error);
    showError('Failed to load dashboard data');
  }
}

async function initInventory(){
  const form = $('#productForm');
  const tbody = $('#prodBody');
  let allProducts = [];

  const searchBox = $('#searchBox');
  const categoryFilter = $('#categoryFilter');
  const statusFilter = $('#statusFilter');
  const sortBy = $('#sortBy');

  await fetchAndRender();

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const payload = {
        id: data.id.trim(), 
        name: data.name.trim(), 
        category: data.category.trim(),
        qty: parseInt(data.qty||'0',10), 
        price: parseFloat(data.price||'0'),
        expiry: data.expiry || null
      };
      
      let res;
      try {
        res = await API.put('/api/products/'+encodeURIComponent(payload.id), payload);
      } catch (error) {
        res = await API.post('/api/products', payload);
      }
      
      form.reset();
      $('#id').removeAttribute('readonly');
      await fetchAndRender();
      showSuccess('Product saved successfully!');
      
    } catch (error) {
      showError(error.message);
    }
  });

  document.addEventListener('click', async (e)=>{
    const delId = e.target.getAttribute('data-del');
    const editId = e.target.getAttribute('data-edit');
    
    if(delId){
      if(confirm(`Are you sure you want to delete product #${delId}?`)){
        try {
          await API.del('/api/products/'+encodeURIComponent(delId));
          await fetchAndRender();
          showSuccess('Product deleted successfully!');
        } catch (error) {
          showError(error.message);
        }
      }
    }
    
    if(editId){
      const p = allProducts.find(x=>x.id===editId);
      if(p){
        $('#id').value = p.id; 
        $('#name').value = p.name; 
        $('#category').value = p.category;
        $('#qty').value = p.qty; 
        $('#price').value = p.price||0; 
        $('#expiry').value = p.expiry||'';
        $('#id').setAttribute('readonly', true);
        window.scrollTo({top:0,behavior:'smooth'});
      }
    }
  });
  
  // --- Universal Excel & CSV Parsing Helpers ---
  function normalizeHeaderKey(header) {
    if (!header) return '';
    return String(header).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function parseExcelDate(val) {
    if (val === null || val === undefined || val === '') return null;

    // If already a Date object
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return null;
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // If numeric Excel serial number (e.g. 45500)
    if (typeof val === 'number') {
      if (isNaN(val) || val <= 0) return null;
      const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(dateObj.getTime())) {
        const y = dateObj.getUTCFullYear();
        const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }

    const str = String(val).trim();
    if (!str) return null;

    // Numeric string (e.g. "45500")
    if (/^\d{4,6}$/.test(str)) {
      const num = parseFloat(str);
      const dateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(dateObj.getTime())) {
        const y = dateObj.getUTCFullYear();
        const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }

    // Check YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
    const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (ymdMatch) {
      const y = ymdMatch[1];
      const m = String(parseInt(ymdMatch[2], 10)).padStart(2, '0');
      const d = String(parseInt(ymdMatch[3], 10)).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // Check DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
    const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (dmyMatch) {
      const d = String(parseInt(dmyMatch[1], 10)).padStart(2, '0');
      const m = String(parseInt(dmyMatch[2], 10)).padStart(2, '0');
      const y = dmyMatch[3];
      return `${y}-${m}-${d}`;
    }

    // Check MM/DD/YYYY
    const mdyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mdyMatch) {
      const first = parseInt(mdyMatch[1], 10);
      const second = parseInt(mdyMatch[2], 10);
      const y = mdyMatch[3];
      if (first > 12 && second <= 12) {
        return `${y}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`;
      }
    }

    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    return null;
  }

  function parseCleanNumber(val, isFloat = false) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : Math.max(0, isFloat ? val : Math.round(val));
    const clean = String(val).replace(/[^0-9.-]/g, '');
    if (!clean) return 0;
    const num = isFloat ? parseFloat(clean) : parseInt(clean, 10);
    return isNaN(num) ? 0 : Math.max(0, num);
  }

  function parseSheetRows(sheet) {
    const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', cellDates: true });
    if (!rawMatrix || rawMatrix.length === 0) return [];

    let headerRowIndex = -1;
    let bestHeaderScore = 0;

    for (let r = 0; r < Math.min(rawMatrix.length, 10); r++) {
      const row = rawMatrix[r];
      if (!Array.isArray(row)) continue;
      let score = 0;
      for (const cell of row) {
        const k = normalizeHeaderKey(cell);
        if (['name', 'productname', 'itemname', 'item', 'product', 'description', 'title', 'particulars'].includes(k)) score += 5;
        if (['productid', 'itemid', 'id', 'sku', 'code', 'itemcode', 'productcode', 'slno', 'sno', 'serialno', 'itemno'].includes(k)) score += 4;
        if (['qty', 'quantity', 'stock', 'units', 'count'].includes(k)) score += 3;
        if (['price', 'rate', 'unitprice', 'cost', 'mrp', 'amount'].includes(k)) score += 3;
        if (['expiry', 'expirydate', 'expdate', 'expirationdate', 'bestbefore', 'useby'].includes(k)) score += 3;
        if (['category', 'productcategory', 'group', 'type', 'dept'].includes(k)) score += 2;
      }
      if (score > bestHeaderScore) {
        bestHeaderScore = score;
        headerRowIndex = r;
      }
    }

    if (headerRowIndex === -1 && rawMatrix.length > 0) {
      headerRowIndex = 0;
    }

    const headers = (rawMatrix[headerRowIndex] || []).map(h => String(h || '').trim());
    const headerMap = {};

    headers.forEach((h, colIndex) => {
      const k = normalizeHeaderKey(h);
      if (!k) return;

      if (!headerMap.name && ['productname', 'itemname', 'name', 'product', 'item', 'description', 'itemdescription', 'particulars', 'title', 'itemtitle', 'details', 'goods'].includes(k)) {
        headerMap.name = colIndex;
      } else if (!headerMap.id && ['productid', 'itemid', 'id', 'sku', 'code', 'itemcode', 'productcode', 'slno', 'sno', 'serialno', 'itemno', 'itemnumber', 'barcode', 'no'].includes(k)) {
        headerMap.id = colIndex;
      } else if (!headerMap.category && ['category', 'productcategory', 'group', 'productgroup', 'department', 'dept', 'type', 'classification', 'segment'].includes(k)) {
        headerMap.category = colIndex;
      } else if (!headerMap.qty && ['quantity', 'qty', 'qtyunits', 'quantityunits', 'stock', 'stockqty', 'units', 'count', 'balance', 'availableqty', 'totalqty', 'availqty', 'instock'].includes(k)) {
        headerMap.qty = colIndex;
      } else if (!headerMap.price && ['price', 'unitprice', 'rate', 'unitrate', 'mrp', 'cost', 'amount', 'sellingprice', 'priceinr', 'pricers', 'unitpriceinr', 'unitpricers'].includes(k)) {
        headerMap.price = colIndex;
      } else if (!headerMap.expiry && ['expirydate', 'expiry', 'expdate', 'expirationdate', 'bestbefore', 'useby', 'validity', 'validtill', 'validthru', 'exp'].includes(k)) {
        headerMap.expiry = colIndex;
      }
    });

    const parsedItems = [];
    const existingIds = new Set();

    for (let r = headerRowIndex + 1; r < rawMatrix.length; r++) {
      const row = rawMatrix[r];
      if (!Array.isArray(row)) continue;

      const hasAnyValue = row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
      if (!hasAnyValue) continue;

      let id = headerMap.id !== undefined ? String(row[headerMap.id] || '').trim() : '';
      let name = headerMap.name !== undefined ? String(row[headerMap.name] || '').trim() : '';
      let category = headerMap.category !== undefined ? String(row[headerMap.category] || '').trim() : 'General';
      let qty = headerMap.qty !== undefined ? parseCleanNumber(row[headerMap.qty], false) : 0;
      let price = headerMap.price !== undefined ? parseCleanNumber(row[headerMap.price], true) : 0;
      let expiry = headerMap.expiry !== undefined ? parseExcelDate(row[headerMap.expiry]) : null;

      if (!name) {
        for (let c = 0; c < row.length; c++) {
          if (c !== headerMap.id && row[c] && typeof row[c] === 'string' && row[c].trim().length > 1) {
            name = row[c].trim();
            break;
          }
        }
      }

      if (!name && !id) continue;
      if (!name) name = `Product ${id}`;

      if (!id) {
        id = `PRD-${String(r).padStart(3, '0')}`;
      }

      if (existingIds.has(id.toLowerCase())) {
        let counter = 2;
        let newId = `${id}-${counter}`;
        while (existingIds.has(newId.toLowerCase())) {
          counter++;
          newId = `${id}-${counter}`;
        }
        id = newId;
      }
      existingIds.add(id.toLowerCase());

      parsedItems.push({
        id,
        name,
        category: category || 'General',
        qty,
        price,
        expiry
      });
    }

    return parsedItems;
  }

  // --- Excel Upload & Delete All Functionality ---
  const excelFileInput = $('#excelFile');
  const uploadExcelBtn = $('#uploadExcelBtn');
  const downloadTemplateBtn = $('#downloadTemplateBtn');
  const deleteAllProductsBtn = $('#deleteAllProductsBtn');
  const excelUploadStatus = $('#excelUploadStatus');

  if (downloadTemplateBtn) {
    downloadTemplateBtn.addEventListener('click', () => {
      if (typeof XLSX === 'undefined') {
        alert('Excel library loading... Please check your internet connection.');
        return;
      }
      const sampleData = [
        { 'Product ID': 'P101', 'Product Name': 'Basmati Rice (5kg)', 'Category': 'Food', 'Quantity': 120, 'Unit Price': 380.00, 'Expiry Date': '2026-08-22' },
        { 'Product ID': 'P102', 'Product Name': 'Whole Wheat Flour (10kg)', 'Category': 'Food', 'Quantity': 85, 'Unit Price': 420.00, 'Expiry Date': '2026-09-15' },
        { 'Product ID': 'P103', 'Product Name': 'Pure Butter (500g)', 'Category': 'Food', 'Quantity': 45, 'Unit Price': 265.00, 'Expiry Date': '2026-08-20' },
        { 'Product ID': 'P104', 'Product Name': 'Organic Cow Milk (1L)', 'Category': 'Food', 'Quantity': 60, 'Unit Price': 65.00, 'Expiry Date': '2026-08-24' },
        { 'Product ID': 'P105', 'Product Name': 'Greek Yogurt (400g)', 'Category': 'Food', 'Quantity': 30, 'Unit Price': 95.00, 'Expiry Date': '2026-08-26' },
        { 'Product ID': 'P106', 'Product Name': 'Almond Milk (1L)', 'Category': 'Food', 'Quantity': 40, 'Unit Price': 145.00, 'Expiry Date': '2026-09-02' },
        { 'Product ID': 'P107', 'Product Name': 'Raw Honey (500g)', 'Category': 'Food', 'Quantity': 75, 'Unit Price': 310.00, 'Expiry Date': '2027-02-15' },
        { 'Product ID': 'P108', 'Product Name': 'Precision Screwdriver Set', 'Category': 'Hardware', 'Quantity': 25, 'Unit Price': 499.00, 'Expiry Date': '' },
        { 'Product ID': 'P109', 'Product Name': 'AA Alkaline Batteries (4-Pack)', 'Category': 'Electronics', 'Quantity': 150, 'Unit Price': 180.00, 'Expiry Date': '2028-12-31' },
        { 'Product ID': 'P110', 'Product Name': 'First Aid Emergency Kit', 'Category': 'Supplies', 'Quantity': 35, 'Unit Price': 750.00, 'Expiry Date': '2027-06-30' }
      ];
      const ws = XLSX.utils.json_to_sheet(sampleData);
      ws['!cols'] = [
        { wch: 14 },
        { wch: 32 },
        { wch: 16 },
        { wch: 12 },
        { wch: 14 },
        { wch: 16 }
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Warehouse Products');
      XLSX.writeFile(wb, 'Warehouse_Product_Import_Template.xlsx');
    });
  }

  if (uploadExcelBtn && excelFileInput) {
    uploadExcelBtn.addEventListener('click', async () => {
      const file = excelFileInput.files[0];
      if (!file) {
        showError('Please select an Excel or CSV file first.');
        return;
      }
      if (typeof XLSX === 'undefined') {
        showError('Excel parsing library not loaded. Please reload the page.');
        return;
      }

      if (excelUploadStatus) {
        excelUploadStatus.style.color = '#0284c7';
        excelUploadStatus.textContent = '⏳ Reading and parsing Excel file...';
      }

      try {
        const dataBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(dataBuffer, { type: 'array', cellDates: true });
        
        let allExtractedProducts = [];
        
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) continue;
          const sheetProducts = parseSheetRows(sheet);
          if (sheetProducts.length > 0) {
            allExtractedProducts.push(...sheetProducts);
          }
        }

        if (allExtractedProducts.length === 0) {
          throw new Error('No valid products found in the file. Ensure rows have product names/details.');
        }

        const BATCH_SIZE = 500;
        let totalAdded = 0;
        let totalUpdated = 0;
        let totalErrors = 0;
        let anyEmailSent = false;
        const totalBatches = Math.ceil(allExtractedProducts.length / BATCH_SIZE);

        for (let i = 0; i < allExtractedProducts.length; i += BATCH_SIZE) {
          const chunk = allExtractedProducts.slice(i, i + BATCH_SIZE);
          const currentBatchNum = Math.floor(i / BATCH_SIZE) + 1;

          if (excelUploadStatus) {
            excelUploadStatus.textContent = totalBatches > 1
              ? `⏳ Uploading batch ${currentBatchNum} of ${totalBatches} (${i + 1} - ${Math.min(i + chunk.length, allExtractedProducts.length)} / ${allExtractedProducts.length} items)...`
              : `⏳ Uploading ${allExtractedProducts.length} products to database...`;
          }

          const res = await API.post('/api/products/bulk', { products: chunk });
          totalAdded += (res.addedCount || 0);
          totalUpdated += (res.updatedCount || 0);
          if (res.errors && res.errors.length) {
            totalErrors += res.errors.length;
          }
          if (res.emailSent) {
            anyEmailSent = true;
          }
        }

        excelFileInput.value = '';
        await fetchAndRender();
        updateNotifications();

        let successMsg = `Successfully imported ${totalAdded} new and updated ${totalUpdated} products (Total: ${allExtractedProducts.length} items)!`;
        if (totalErrors > 0) {
          successMsg += ` Note: ${totalErrors} row(s) had errors.`;
        }

        if (excelUploadStatus) {
          excelUploadStatus.style.color = '#16a34a';
          excelUploadStatus.textContent = `✅ ${successMsg} ${anyEmailSent ? '📧 FEFO alert emails sent!' : ''}`;
        }
        showSuccess(successMsg);

      } catch (err) {
        console.error('Excel upload error:', err);
        if (excelUploadStatus) {
          excelUploadStatus.style.color = '#dc2626';
          excelUploadStatus.textContent = `❌ Import failed: ${err.message}`;
        }
        showError(`Import failed: ${err.message}`);
      }
    });
  }

  if (deleteAllProductsBtn) {
    deleteAllProductsBtn.addEventListener('click', async () => {
      if (allProducts.length === 0) {
        showError('No products to delete.');
        return;
      }
      const confirmDelete = confirm(`⚠️ WARNING: Are you sure you want to DELETE ALL ${allProducts.length} products?\n\nThis action cannot be undone.`);
      if (!confirmDelete) return;

      try {
        const res = await API.del('/api/products/all');
        await fetchAndRender();
        updateNotifications();
        showSuccess(res.message || 'All products deleted successfully!');
      } catch (err) {
        showError(`Delete all failed: ${err.message}`);
      }
    });
  }

  [searchBox, categoryFilter, statusFilter, sortBy].forEach(el => {
    if (el) el.addEventListener('input', render);
  });

  async function fetchAndRender(){
    try {
      allProducts = await API.get('/api/products');
      populateFilters();
      render();
    } catch (error) {
      showError('Failed to load products');
    }
  }
  
  function populateFilters(){
    if (categoryFilter) {
      const categories = [...new Set(allProducts.map(p => p.category))];
      categoryFilter.innerHTML = `<option value="">All Categories</option>` + 
        categories.map(c => `<option value="${c}">${c}</option>`).join('');
    }
  }

  function render(){
    let products = [...allProducts];
    
    // Add status to each product
    products.forEach(p => {
      const days = daysUntil(p.expiry);
      if (days < 0) p.status = 'Expired';
      else if (days <= 60) p.status = 'Warning';
      else p.status = 'Safe';
    });

    // Filter
    if (searchBox && categoryFilter && statusFilter) {
      const query = searchBox.value.toLowerCase();
      const category = categoryFilter.value;
      const status = statusFilter.value;
      
      products = products.filter(p => {
        const nameMatch = p.name.toLowerCase().includes(query);
        const idMatch = p.id.toLowerCase().includes(query);
        const categoryMatch = !category || p.category === category;
        const statusMatch = !status || p.status === status;
        return (nameMatch || idMatch) && categoryMatch && statusMatch;
      });
    }

    // Sort
    if (sortBy) {
      const [sortKey, sortDir] = sortBy.value.split('-');
      products.sort((a,b) => {
        let valA, valB;
        if(sortKey === 'updated') { 
          valA = a.createdAt; valB = b.createdAt; 
        }
        else if(sortKey === 'name') { 
          valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); 
        }
        else if(sortKey === 'id') { 
          valA = a.id; valB = b.id; 
        }
        else if(sortKey === 'expiry') { 
          valA = a.expiry ? new Date(a.expiry) : new Date('2999-12-31'); 
          valB = b.expiry ? new Date(b.expiry) : new Date('2999-12-31'); 
        }

        if (valA < valB) return sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // Render table
    if (tbody) {
      tbody.innerHTML = '';
      products.forEach(p => {
        const statusClass = `status-${p.status.toLowerCase()}`;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${p.id}</td><td>${p.name}</td><td>${p.category||''}</td>
          <td>${p.qty}</td><td>${p.expiry||'-'}</td><td>${fmtINR(p.price||0)}</td>
          <td><div class="status-badge ${statusClass}">${p.status}</div></td>
          <td class="actions">
            <button class="btn" data-edit="${p.id}">Edit</button>
            <button class="btn danger" data-del="${p.id}">Delete</button>
          </td>`;
        tbody.appendChild(tr);
      });
    }
  }
}

async function initOrders(){
  const form = $('#orderForm');
  const tbody = $('#orderBody');
  
  await renderOptions();
  await render();

  if (form) {
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        const items = JSON.parse(data.items||'[]');
        if(items.length === 0) { 
          showError('Please add at least one item to the order.'); 
          return; 
        }
        
        const payload = { 
          id: data.id||undefined, 
          customer: data.customer, 
          date: data.date, 
          items 
        };
        
        const res = await API.post('/api/orders', payload);
        
        form.reset();
        $('#itemsList').innerHTML = '';
        $('#items').value = '[]';
        await render();
        await renderOptions();
        showSuccess('Order created successfully!');
        
      } catch (error) {
        showError(error.message);
      }
    });
  }

  async function renderOptions(){
    const select = $('#itemBuilder');
    if (!select) return;
    
    try {
      const products = await API.get('/api/products');
      select.innerHTML = products.map(p => 
        `<option value="${p.id}">${p.id} - ${p.name} (Stock: ${p.qty})</option>`
      ).join('');
      
      const addBtn = $('#addItem');
      const list = $('#itemsList');
      const itemsInput = $('#items');
      
      if (!addBtn || !list || !itemsInput) return;
      
      let current = JSON.parse(itemsInput.value || '[]');
      
      function sync(){
        list.innerHTML = current.map((it,i)=> 
          `<div class="badge" style="background:#eef9ff;color:#0369a1;padding:8px;cursor:default;">
            #${it.pid} × ${it.qty} 
            <button type="button" class="btn" data-rm="${i}" style="padding:2px 6px;margin-left:8px;">×</button>
          </div>`
        ).join('');
        itemsInput.value = JSON.stringify(current);
      }
      
      addBtn.addEventListener('click', ()=>{
        const pid = select.value;
        const qty = parseInt($('#itemQty')?.value||'1',10);
        if(!pid || qty<=0) return;
        current.push({pid, qty});
        sync();
      });
      
      document.addEventListener('click',(e)=>{
        const idx = e.target.getAttribute('data-rm');
        if(idx!=null){ 
          current.splice(parseInt(idx,10),1); 
          sync(); 
        }
      });
      
      sync();
    } catch (error) {
      showError('Failed to load products for order');
    }
  }

  async function render(){
    if (!tbody) return;
    
    try {
      const orders = await API.get('/api/orders');
      tbody.innerHTML = '';
      orders.forEach(o => {
        const itemsText = (o.items||[]).map(it => `${it.pid}×${it.qty}`).join(', ');
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${o.id}</td>
          <td>${o.customer}</td>
          <td>${itemsText}</td>
          <td>${o.status}</td>
          <td>${o.date}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (error) {
      showError('Failed to load orders');
    }
  }
}

async function initDispatch(){
  const tbody = $('#dispatchBody');
  if (!tbody) return;
  
  async function render(){
    try {
      const rows = await API.get('/api/dispatches');
      tbody.innerHTML = rows.length ? 
        rows.map(d => `
          <tr>
            <td>${d.id}</td>
            <td>${d.order_id}</td>
            <td>${d.transport}</td>
            <td>${d.status}</td>
          </tr>
        `).join('') :
        '<tr><td colspan="4">No dispatches yet.</td></tr>';
    } catch (error) {
      showError('Failed to load dispatches');
    }
  }
  
  await render();
}

async function initReports(){
  try {
    const [metrics, products, orders, dispatches] = await Promise.all([
      API.get('/api/metrics'),
      API.get('/api/products'),
      API.get('/api/orders'),
      API.get('/api/dispatches')
    ]);
    
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    
    set('rStockIn', products.reduce((a,p)=>a+p.qty,0));
    set('rOrders', orders.length);
    set('rDispatches', dispatches.length);
    set('rAlerts', metrics.expired + metrics.low + metrics.soon);
    
  } catch (error) {
    showError('Failed to load reports');
  }
}

// Chart initialization
async function initCharts(){
  const categoryCtx = document.getElementById('categoryChart')?.getContext('2d');
  const expiryCtx = document.getElementById('expiryChart')?.getContext('2d');
  
  if (!categoryCtx || !expiryCtx) return;
  
  try {
    const products = await API.get('/api/products');
    
    // Products by Category
    const categoryCounts = {};
    products.forEach(p => {
      categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
    });
    
    new Chart(categoryCtx, {
      type: 'bar',
      data: {
        labels: Object.keys(categoryCounts),
        datasets: [{
          label: 'Number of Products',
          data: Object.values(categoryCounts),
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        }]
      },
      options: {
        scales: { y: { beginAtZero: true } }
      }
    });

    // Expiry Status Overview
    const statusCounts = { Safe: 0, Warning: 0, Expired: 0 };
    products.forEach(p => {
      const days = daysUntil(p.expiry);
      if (days < 0) statusCounts.Expired++;
      else if (days <= 60) statusCounts.Warning++;
      else statusCounts.Safe++;
    });
    
    new Chart(expiryCtx, {
      type: 'doughnut',
      data: {
        labels: ['Safe', 'Warning', 'Expired'],
        datasets: [{
          label: 'Products by Expiry Status',
          data: [statusCounts.Safe, statusCounts.Warning, statusCounts.Expired],
          backgroundColor: [
            'rgba(75, 192, 192, 0.6)',
            'rgba(255, 206, 86, 0.6)',
            'rgba(255, 99, 132, 0.6)'
          ],
          borderColor: [
            'rgba(75, 192, 192, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(255, 99, 132, 1)'
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
    
  } catch (error) {
    console.error('Failed to initialize charts:', error);
  }
}

// Notification functions
function showError(message) {
  showNotification(message, 'error');
}

function showSuccess(message) {
  showNotification(message, 'success');
}

function showNotification(message, type = 'info') {
  // Remove existing notifications
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <span>${message}</span>
    <button onclick="this.parentElement.remove()">×</button>
  `;
  
  // Add styles if not already present
  if (!document.querySelector('style[data-notifications]')) {
    const style = document.createElement('style');
    style.setAttribute('data-notifications', 'true');
    style.textContent = `
      .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 16px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 400px;
        animation: slideIn 0.3s ease;
      }
      
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      
      .notification-success { background: #059669; }
      .notification-error { background: #dc2626; }
      .notification-info { background: #2563eb; }
      
      .notification button {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 18px;
        padding: 0;
        line-height: 1;
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 5000);
}

// Main boot function
function boot(){
  // Check authentication first
  if (!checkAuth()) {
    return;
  }
  
  startClock();
  updateNotifications();
  markActive();
  
  const page = document.body.getAttribute('data-page');
  if(page==='dashboard') {
    initDashboard();
    if (typeof Chart !== 'undefined') {
      document.addEventListener('DOMContentLoaded', initCharts);
    }
  }
  if(page==='inventory') initInventory();
  if(page==='orders') initOrders();
  if(page==='dispatch') initDispatch();
  if(page==='reports') initReports();

  // Mobile menu toggle
  const toggle = document.querySelector('.menu-toggle');
  if(toggle){ 
    toggle.addEventListener('click', ()=> {
      document.querySelector('.sidebar').classList.toggle('open');
    }); 
  }
  
  // Alerts Sidebar toggle
  const bell = document.getElementById('notificationBell');
  const sidebar = document.getElementById('alertsSidebar');
  const closeBtn = document.getElementById('closeAlerts');

  // ADDED: Function to close the sidebar if click is outside
  function closeAlertsOnClickOutside(event) {
    // Check if the sidebar is open and the click target is neither the sidebar nor the bell icon
    if (sidebar.classList.contains('open') && !sidebar.contains(event.target) && !bell.contains(event.target)) {
      sidebar.classList.remove('open');
      // IMPORTANT: Remove the listener once the sidebar is closed to prevent conflicts
      document.removeEventListener('click', closeAlertsOnClickOutside);
    }
  }

  if (bell && sidebar && closeBtn) {
    bell.addEventListener('click', async (e) => {
      e.stopPropagation(); // Prevent this click from immediately closing the sidebar via the document listener

      sidebar.classList.add('open');
      
      // Fetch and render alerts... (keeping original logic)
      try {
        // CORRECTED: Fetch the data object, then extract the 'alerts' array
        const data = await API.get('/api/alerts');
        const alerts = data.alerts || []; // Use the 'alerts' array, defaulting to empty if null/undefined

        const list = document.getElementById('alertsList');
        
        if (alerts.length === 0) {
          list.innerHTML = '<p>No urgent actions required. 🎉</p>';
        } else {
          list.innerHTML = alerts.map(p => `
            <div class="alert-item">
              <strong>${p.name} (ID: ${p.id})</strong>
              <span>${p.status === 'Expired'
                  ? `Expired ${-p.days} day(s) ago`
                  : `Expires in ${p.days} day(s)`}</span>
              <span><b>Dispatch By:</b> ${p.safeDispatchDate || 'N/A'}</span>
            </div>
          `).join('');
        }
      } catch (error) {
        const list = document.getElementById('alertsList');
        list.innerHTML = '<p>Failed to load alerts. Please try again.</p>';
        console.error('Alerts sidebar error:', error); // Add console log for easier debugging
      }
      
      // ADDED: Logic to add click listener for closing when opening
      // We add this listener *after* the current event finishes (using setTimeout) 
      // to ensure the bell click doesn't trigger it immediately.
      setTimeout(() => {
          document.addEventListener('click', closeAlertsOnClickOutside);
      }, 0);
    });
    
    closeBtn.addEventListener('click', () => {
      sidebar.classList.remove('open');
      // ADDED: Remove the click listener when closed manually
      document.removeEventListener('click', closeAlertsOnClickOutside);
    });
  }
  
  // Add logout functionality
  const logoutBtns = $all('[data-logout]');
  logoutBtns.forEach(btn => {
    btn.addEventListener('click', logout);
  });
  
  // --- USER PROFILE SIDEBAR AND MODAL LOGIC (ADDED) ---
  const profileTrigger = $('#profileTrigger'), profileSidebar = $('#profileSidebar'), closeProfileBtn = $('#closeProfile'), overlay = $('#overlay');
  
  if (profileTrigger && profileSidebar && closeProfileBtn && overlay) {
    const toggleProfileSidebar = () => { profileSidebar.classList.toggle('open'); overlay.classList.toggle('active'); };
    profileTrigger.addEventListener('click', toggleProfileSidebar);
    closeProfileBtn.addEventListener('click', toggleProfileSidebar);
    overlay.addEventListener('click', () => {
        if(profileSidebar.classList.contains('open')) toggleProfileSidebar();
    });
  }
  
  // EDIT PROFILE (NAME) MODAL LOGIC
  const editProfileModal = $('#editProfileModal');
  const editProfileBtn = $('#editProfileBtn');
  const closeModalBtn = $('#closeModalBtn');
  const cancelBtn = $('#cancelBtn');
  const editProfileForm = $('#editProfileForm');

  if (editProfileModal && editProfileBtn && editProfileForm) {
    const openModal = () => {
      $('#editName').value = currentUser.name;
      editProfileModal.classList.add('open');
    };
    
    const closeModal = () => {
      editProfileModal.classList.remove('open');
    };

    editProfileBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    editProfileModal.addEventListener('click', (e) => {
        if (e.target === editProfileModal) closeModal();
    });

    editProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#editName').value.trim();
      
      if (!name) {
          showError('Name cannot be empty.');
          return;
      }
      
      const payload = { name };

      try {
        const result = await API.put('/api/user/profile', payload);
        if (result.success) {
          currentUser = result.user;
          localStorage.setItem('user', JSON.stringify(result.user));
          updateAllUserInfoDisplays(); 
          showSuccess('Profile updated successfully!');
          closeModal();
        }
      } catch (error) {
        showError(error.message || 'Failed to update profile.');
      }
    });
  }
  
  // NEW: CHANGE PASSWORD MODAL LOGIC
  const changePasswordModal = $('#changepasswordl');
  const changePasswordBtn = $('#changepassword');
  const closePasswordModalBtn = $('#closePasswordModal');
  const cancelPasswordBtn = $('#cancelPasswordBtn');
  const changePasswordForm = $('#changePasswordForm');

  if (changePasswordModal && changePasswordBtn && changePasswordForm) {
    const openPasswordModal = () => {
      changePasswordForm.reset(); // Clear old values
      changePasswordModal.classList.add('open');
    };
    
    const closePasswordModal = () => {
      changePasswordModal.classList.remove('open');
    };

    changePasswordBtn.addEventListener('click', () => {
      profileSidebar.classList.remove('open'); // Close profile sidebar
      overlay.classList.remove('active');
      openPasswordModal(); // Open password modal
    });
    
    closePasswordModalBtn.addEventListener('click', closePasswordModal);
    cancelPasswordBtn.addEventListener('click', closePasswordModal);
    changePasswordModal.addEventListener('click', (e) => {
        if (e.target === changePasswordModal) closePasswordModal();
    });

    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPassword = $('#editPassword').value;
      const confirmPassword = $('#confirmPassword').value;
      
      if (!newPassword || newPassword.length < 6) {
          showError('New password must be at least 6 characters long.');
          return;
      }
      
      if (newPassword !== confirmPassword) {
          showError('New passwords do not match.');
          return;
      }
      
      const payload = { newPassword };

      try {
        const result = await API.put('/api/user/password', payload);
        if (result.success) {
          showSuccess(result.message + ' You will be logged out now.');
          closePasswordModal();
          // Force logout to apply new token/session rules
          setTimeout(logout, 3000); 
        }
      } catch (error) {
        showError(error.message || 'Failed to update password.');
      }
    });
  }
  // ------------------------------------------------------------------

}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// Enhanced Chart.js implementation with beautiful styling and specific metrics
async function initCharts(){
  const categoryCtx = document.getElementById('categoryChart')?.getContext('2d');
  const expiryCtx = document.getElementById('expiryChart')?.getContext('2d');
  
  if (!categoryCtx || !expiryCtx) return;
  
  try {
    const [products, orders, dispatches] = await Promise.all([
      API.get('/api/products'),
      API.get('/api/orders'),
      API.get('/api/dispatches')
    ]);
    
    // Chart.js default configuration for beautiful styling
    Chart.defaults.font.family = 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#374151';
    
    // Enhanced color palette
    const colorPalette = [
      '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b',
      '#10b981', '#06b6d4', '#84cc16', '#f97316', '#6b7280'
    ];
    
    const gradientColors = [
      'rgba(99, 102, 241, 0.8)', 'rgba(139, 92, 246, 0.8)', 'rgba(236, 72, 153, 0.8)',
      'rgba(239, 68, 68, 0.8)', 'rgba(245, 158, 11, 0.8)', 'rgba(16, 185, 129, 0.8)',
      'rgba(6, 182, 212, 0.8)', 'rgba(132, 204, 22, 0.8)', 'rgba(249, 115, 22, 0.8)',
      'rgba(107, 114, 128, 0.8)'
    ];

    // 1. Enhanced Category Distribution Chart
    const categoryCounts = {};
    const categoryValues = {};
    
    products.forEach(p => {
      const category = p.category || 'Uncategorized';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      categoryValues[category] = (categoryValues[category] || 0) + (p.qty * (p.price || 0));
    });

    const categoryLabels = Object.keys(categoryCounts);
    
    new Chart(categoryCtx, {
      type: 'bar',
      data: {
        labels: categoryLabels,
        datasets: [{
          label: 'Product Count',
          data: Object.values(categoryCounts),
          backgroundColor: categoryLabels.map((_, i) => gradientColors[i % gradientColors.length]),
          borderColor: categoryLabels.map((_, i) => colorPalette[i % colorPalette.length]),
          borderWidth: 2,
          borderRadius: 6,
          borderSkipped: false,
        }, {
          label: 'Category Value (₹)',
          data: Object.values(categoryValues),
          type: 'line',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderColor: '#3b82f6',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#3b82f6',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
          yAxisID: 'y1',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: false
          },
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true,
              padding: 20,
              font: { size: 11, weight: '500' }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            titleColor: '#f9fafb',
            bodyColor: '#f9fafb',
            borderColor: '#374151',
            borderWidth: 1,
            cornerRadius: 8,
            displayColors: true,
            callbacks: {
              label: function(context) {
                if (context.datasetIndex === 1) {
                  return `Value: ${fmtINR(context.parsed.y)}`;
                }
                return `${context.dataset.label}: ${context.parsed.y} items`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              font: { weight: '500' }
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(156, 163, 175, 0.2)',
              drawBorder: false
            },
            ticks: {
              callback: function(value) {
                return value + ' items';
              }
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            beginAtZero: true,
            grid: {
              drawOnChartArea: false,
            },
            ticks: {
              callback: function(value) {
                return '₹' + (value/1000).toFixed(0) + 'K';
              }
            }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });

    // Update category insights
    if (categoryLabels.length > 0) {
      const topCategory = categoryLabels.reduce((a, b) => 
        categoryCounts[a] > categoryCounts[b] ? a : b
      );
      const valuableCategory = categoryLabels.reduce((a, b) => 
        categoryValues[a] > categoryValues[b] ? a : b
      );
      
      const topCategoryEl = document.getElementById('topCategory');
      const valuableCategoryEl = document.getElementById('valuableCategory');
      
      if (topCategoryEl) topCategoryEl.textContent = `${topCategory} (${categoryCounts[topCategory]} items)`;
      if (valuableCategoryEl) valuableCategoryEl.textContent = `${valuableCategory} (${fmtINR(categoryValues[valuableCategory])})`;
    }

    // 2. Enhanced Expiry & Stock Status Chart
    const statusCounts = { 
      'Safe (>60 days)': 0, 
      'Warning (30-60 days)': 0, 
      'Critical (<30 days)': 0, 
      'Expired': 0,
      'Low Stock': 0,
      'Out of Stock': 0
    };
    
    const statusValues = { 
      'Safe (>60 days)': 0, 
      'Warning (30-60 days)': 0, 
      'Critical (<30 days)': 0, 
      'Expired': 0,
      'Low Stock': 0,
      'Out of Stock': 0
    };

    products.forEach(p => {
      const days = daysUntil(p.expiry);
      const value = p.qty * (p.price || 0);
      
      if (p.qty === 0) {
        statusCounts['Out of Stock']++;
        statusValues['Out of Stock'] += value;
      } else if (p.qty <= (p.low || 0)) {
        statusCounts['Low Stock']++;
        statusValues['Low Stock'] += value;
      } else if (days < 0) {
        statusCounts['Expired']++;
        statusValues['Expired'] += value;
      } else if (days <= 30) {
        statusCounts['Critical (<30 days)']++;
        statusValues['Critical (<30 days)'] += value;
      } else if (days <= 60) {
        statusCounts['Warning (30-60 days)']++;
        statusValues['Warning (30-60 days)'] += value;
      } else {
        statusCounts['Safe (>60 days)']++;
        statusValues['Safe (>60 days)'] += value;
      }
    });

    const statusColors = [
      '#10b981', // Safe - green
      '#f59e0b', // Warning - amber  
      '#ef4444', // Critical - red
      '#7c2d12', // Expired - dark red
      '#f97316', // Low stock - orange
      '#6b7280'  // Out of stock - gray
    ];

    new Chart(expiryCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(statusCounts),
        datasets: [{
          label: 'Product Count',
          data: Object.values(statusCounts),
          backgroundColor: statusColors.map(color => color + 'CC'),
          borderColor: statusColors,
          borderWidth: 3,
          hoverBorderWidth: 4,
          hoverOffset: 8,
          cutout: '65%',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: false
          },
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              padding: 15,
              font: { size: 10, weight: '500' },
              generateLabels: function(chart) {
                const data = chart.data;
                return data.labels.map((label, i) => {
                  const count = data.datasets[0].data[i];
                  return {
                    text: `${label}: ${count}`,
                    fillStyle: data.datasets[0].backgroundColor[i],
                    strokeStyle: data.datasets[0].borderColor[i],
                    pointStyle: 'circle',
                    hidden: false,
                    index: i
                  };
                });
              }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            titleColor: '#f9fafb',
            bodyColor: '#f9fafb',
            borderColor: '#374151',
            borderWidth: 1,
            cornerRadius: 8,
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const count = context.parsed;
                const value = Object.values(statusValues)[context.dataIndex];
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
                return [
                  `${label}: ${count} items (${percentage}%)`,
                  `Value: ${fmtINR(value)}`
                ];
              }
            }
          }
        }
      }
    });

    // Update health score and risk level
    const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const healthScore = total > 0 ? 
      Math.round(((statusCounts['Safe (>60 days)'] + statusCounts['Warning (30-60 days)']) / total) * 100) : 0;
    
    const criticalCount = statusCounts['Critical (<30 days)'] + statusCounts['Expired'] + statusCounts['Out of Stock'];
    const riskLevel = total > 0 ? 
      (criticalCount / total > 0.2 ? 'High' : criticalCount / total > 0.1 ? 'Medium' : 'Low') : 'Unknown';

    const healthScoreEl = document.getElementById('healthScore');
    const riskLevelEl = document.getElementById('riskLevel');
    
    if (healthScoreEl) healthScoreEl.textContent = `${healthScore}%`;
    if (riskLevelEl) {
      riskLevelEl.textContent = riskLevel;
      riskLevelEl.className = `insight-value risk-${riskLevel.toLowerCase()}`;
    }

    // Update additional stats
    const avgValue = products.length > 0 ? 
      products.reduce((sum, p) => sum + (p.price || 0), 0) / products.length : 0;
    
    const recentOrders = orders.filter(o => {
      const orderDate = new Date(o.date);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return orderDate >= weekAgo;
    }).length;

    const totalOrders = orders.length;
    const fulfillmentRate = totalOrders > 0 ? 
      Math.round((orders.filter(o => o.status === 'Completed').length / totalOrders) * 100) : 0;

    const avgValueEl = document.getElementById('avgValue');
    const weeklyOrdersEl = document.getElementById('weeklyOrders');
    const fulfillmentRateEl = document.getElementById('fulfillmentRate');
    const turnoverRateEl = document.getElementById('turnoverRate');

    if (avgValueEl) avgValueEl.textContent = fmtINR(avgValue);
    if (weeklyOrdersEl) weeklyOrdersEl.textContent = recentOrders;
    if (fulfillmentRateEl) fulfillmentRateEl.textContent = `${fulfillmentRate}%`;
    if (turnoverRateEl) turnoverRateEl.textContent = `${Math.round(Math.random() * 15 + 5)}%`; // Placeholder

  } catch (error) {
    console.error('Failed to initialize enhanced charts:', error);
  }
}

// Handle charts initialization separately for dashboard
if(document.body.getAttribute('data-page')==='dashboard' && typeof Chart !== 'undefined'){
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCharts);
  } else {
    initCharts();
  }
}