// ─── Supabase Configuration ──────────────────────────────────────────────────
// IANPS Universal Feedback Hub
const supabaseUrl = 'https://qdbosheknbgyqhtoxmfv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkYm9zaGVrbmJneXFodG94bWZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMzU4MzAsImV4cCI6MjA4ODkxMTgzMH0.x1QtKn5dXj30gH7e-w31OrkrSBfIQS9hr2Yiq9Rlxik';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let currentTenantId = null;

// ─── Fingerprinting Utility ──────────────────────────────────────────────────
async function getFingerprint() {
    const components = [
        navigator.userAgent,
        navigator.language,
        screen.colorDepth,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
        !!window.sessionStorage,
        !!window.localStorage,
        !!window.indexedDB
    ];

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("IANPS_Fingerprint", 2, 15);
    components.push(canvas.toDataURL());

    const str = components.join('###');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return 'ps_' + Math.abs(hash).toString(16);
}

// ─── Entry Point ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    let storeId = urlParams.get('t') || urlParams.get('tienda_id') || '';
    let areaId = urlParams.get('a') || urlParams.get('area_id') || '';
    let qrId = urlParams.get('id_qr') || '';

    // PERSISTENCIA: Si están en URL, guardarlos. Si no, recuperararlos de localStorage.
    if (storeId) localStorage.setItem('ps_store_id', storeId);
    else storeId = localStorage.getItem('ps_store_id') || '';

    if (areaId) localStorage.setItem('ps_area_id', areaId);
    else areaId = localStorage.getItem('ps_area_id') || '';

    if (qrId) localStorage.setItem('ps_qr_id', qrId);
    else qrId = localStorage.getItem('ps_qr_id') || '';

    console.log('Contexto:', { storeId, areaId, qrId });

    if (!storeId || !areaId) {
        document.getElementById('display_store').textContent = '⚠️ Enlace incompleto';
        document.getElementById('display_area').textContent = 'Escanee el QR nuevamente';
        return;
    }

    // 1. Fetch Dynamic Branding & Store Info
    try {
        // A. Obtener datos de la tienda y el tenant_id
        const { data: store, error: storeErr } = await _supabase
            .from('Tiendas_Catalogo')
            .select('nombre, tenant_id')
            .eq('id', storeId)
            .single();

        if (storeErr || !store) throw new Error('Tienda no encontrada');
        
        currentTenantId = store.tenant_id;
        document.getElementById('display_store').textContent = store.nombre;

        // B. Obtener Branding del Tenant
        const { data: tenant, error: tenantErr } = await _supabase
            .from('tenants')
            .select('name, logo_url, primary_color')
            .eq('id', currentTenantId)
            .single();

        if (!tenantErr && tenant) {
            // Aplicar branding dinámico
            document.title = `${tenant.name} | Feedback`;
            const logoEl = document.getElementById('brandLogo');
            if (logoEl && tenant.logo_url) {
                logoEl.src = tenant.logo_url;
                logoEl.alt = tenant.name;
            }
            if (document.getElementById('brandNameFooter')) {
                document.getElementById('brandNameFooter').textContent = tenant.name;
            }
            
            // Aplicar color primario
            const color = tenant.primary_color || '#3b82f6';
            document.documentElement.style.setProperty('--primary', color);
            // También inyectar style tag para sobreescribir botones si es necesario
            const style = document.createElement('style');
            style.innerHTML = `
                .btn-submit { background: ${color} !important; }
                .option-btn.selected { background: ${color} !important; color: white !important; }
                .emoji-btn.selected { border-color: ${color} !important; background: ${color}11 !important; }
            `;
            document.head.appendChild(style);
        }

        // C. Obtener el área
        const { data: area } = await _supabase
            .from('Areas_Catalogo')
            .select('nombre')
            .eq('id', areaId)
            .single();
        
        if (area) document.getElementById('display_area').textContent = area.nombre;

        // D. Cargar pregunta dinámica
        loadDynamicQuestion(areaId);

    } catch (err) {
        console.error('Error cargando configuración:', err);
        document.getElementById('display_store').textContent = 'Error de conexión';
        return;
    }

    // 2. Browser Fingerprinting & Fraud Check
    const deviceId = await getFingerprint();
    const deviceInfoEl = document.getElementById('device_info');
    if (deviceInfoEl) deviceInfoEl.textContent = `Device: ${deviceId}`;

    // Master Mode Bypass Setup
    const masterBypassBtn = document.getElementById('masterBypassBtn');
    let isMasterMode = localStorage.getItem('ps_master_mode') === 'active';
    if (isMasterMode && masterBypassBtn) masterBypassBtn.classList.add('active');

    if (masterBypassBtn) {
        masterBypassBtn.addEventListener('click', () => {
            const pass = prompt('Modo Maestro - Ingrese contraseña:');
            if (pass === '1972') {
                localStorage.setItem('ps_master_mode', 'active');
                isMasterMode = true;
                masterBypassBtn.classList.add('active');
                alert('¡Modo Maestro Activado!');
                window.location.reload();
            }
        });
    }

    // Cooldown Check (12h)
    if (!isMasterMode) {
        const lastSent = localStorage.getItem(`feedback_sent_${storeId}_${areaId}`);
        if (lastSent && (Date.now() - parseInt(lastSent) < 12 * 60 * 60 * 1000)) {
            document.getElementById('feedbackForm').style.display = 'none';
            document.getElementById('cooldownMessage').style.display = 'block';
            return;
        }
    }

    // 3. Form Submission Logic
    const feedbackForm = document.getElementById('feedbackForm');
    const emojiBtns = document.querySelectorAll('.emoji-btn');
    const satisfaccionInput = document.getElementById('satisfaccionInput');
    const detractorSection = document.getElementById('detractorSection');

    emojiBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            emojiBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            const val = parseInt(btn.dataset.value);
            satisfaccionInput.value = val;
            if (val <= 2) {
                detractorSection.style.display = 'block';
                document.getElementById('extraInfo').required = true;
            } else {
                detractorSection.style.display = 'none';
                document.getElementById('extraInfo').required = false;
            }
        });
    });

    feedbackForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rating = parseInt(satisfaccionInput.value);
        if (!rating) { alert('Selecciona una calificación'); return; }

        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.querySelector('.loader').style.display = 'inline-block';
        submitBtn.querySelector('span').innerText = 'Enviando...';

        const payload = {
            id_qr: qrId,
            tienda_id: storeId,
            area_id: areaId,
            satisfaccion: rating,
            calidad_info: document.getElementById('dynamicQuestionInput')?.value || '',
            comentario: document.getElementById('extraInfo')?.value || '',
            device_id: deviceId,
            tenant_id: currentTenantId
        };

        try {
            const { data: feedback, error } = await _supabase.from('Feedback').insert([payload]).select();
            if (error) throw error;

            if (rating <= 2 && feedback && feedback.length > 0) {
                const whatsapp = document.getElementById('whatsapp')?.value || '';
                const email = document.getElementById('email')?.value || '';
                const contactInfo = [whatsapp, email].filter(Boolean).join(' | ') || 'No proporcionado';

                await _supabase.from('Issues').insert([{
                    feedback_id: feedback[0].id,
                    titulo: `Feedback Crítico: ${rating} Estrellas`,
                    descripcion: `Comentario: ${payload.comentario}\nContacto: ${contactInfo}`,
                    categoria: 'Servicio',
                    severidad: rating === 1 ? 'Crítica' : 'Alta',
                    tienda_id: storeId,
                    area_id: areaId,
                    tenant_id: currentTenantId
                }]);
            }

            localStorage.setItem(`feedback_sent_${storeId}_${areaId}`, Date.now().toString());
            feedbackForm.style.display = 'none';
            document.getElementById('successMessage').style.display = 'block';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            console.error('Error enviando feedback:', err);
            alert('Error al enviar: ' + err.message);
            submitBtn.disabled = false;
            submitBtn.querySelector('.loader').style.display = 'none';
            submitBtn.querySelector('span').innerText = 'Enviar opinión';
        }
    });
});

async function loadDynamicQuestion(areaId) {
    try {
        const { data, error } = await _supabase
            .from('Area_Preguntas')
            .select('*')
            .eq('area_id', areaId)
            .eq('numero_pregunta', 2)
            .eq('activa', true)
            .eq('tenant_id', currentTenantId)
            .single();

        if (!data || error) return;

        const container = document.getElementById('dynamicQuestionContainer');
        const label = document.getElementById('dynamicQuestionLabel');
        const optionsContainer = document.getElementById('dynamicQuestionOptions');
        const input = document.getElementById('dynamicQuestionInput');

        container.style.display = 'block';
        label.textContent = `2. ${data.texto_pregunta}`;

        if (data.tipo_respuesta === 'si_no') {
            optionsContainer.innerHTML = `
                <button type="button" class="option-btn dynamic-option" data-value="Sí">Sí</button>
                <button type="button" class="option-btn dynamic-option" data-value="No">No</button>
            `;
        } else if (data.tipo_respuesta === 'multiple' && data.opciones) {
            const opciones = typeof data.opciones === 'string' ? JSON.parse(data.opciones) : data.opciones;
            optionsContainer.innerHTML = opciones.map(opcion =>
                `<button type="button" class="option-btn dynamic-option" data-value="${opcion}">${opcion}</button>`
            ).join('');
        }

        const dynamicBtns = document.querySelectorAll('.dynamic-option');
        dynamicBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                dynamicBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                input.value = btn.dataset.value;
            });
        });
    } catch (e) { console.error(e); }
}
