// Configuración de Supabase (Nueva URL para proyecto SaaS)
const supabaseUrl = window.tenantConfig.supabaseUrl || 'REPLACE_WITH_SUPABASE_URL';
const supabaseKey = window.tenantConfig.supabaseKey || 'REPLACE_WITH_SUPABASE_ANON_KEY';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// Fingerprinting Utility
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
    ctx.fillText(window.tenantConfig.name + "Fingerprint", 2, 15);
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

document.addEventListener('DOMContentLoaded', async () => {
    // 0. Branding Init
    document.title = window.tenantConfig.name + ' Feedback | Premium';
    const logoEl = document.getElementById('brandLogo');
    if (logoEl) { logoEl.src = window.tenantConfig.logoUrl; logoEl.alt = window.tenantConfig.name; }
    const footerNameEl = document.getElementById('brandNameFooter');
    if (footerNameEl) footerNameEl.textContent = window.tenantConfig.name;

    // 1. Leer parámetros de la URL (Soporte para t/a y tienda_id/area_id)
    const urlParams = new URLSearchParams(window.location.search);
    let storeId = urlParams.get('t') || urlParams.get('tienda_id') || '';
    let areaId = urlParams.get('a') || urlParams.get('area_id') || '';
    let qrId = urlParams.get('id_qr') || '';

    // PERSISTENCIA: Si están en URL, guardarlos. Si no, recuperarlos de localStorage.
    if (storeId) localStorage.setItem('ps_store_id', storeId);
    else storeId = localStorage.getItem('ps_store_id') || '';

    if (areaId) localStorage.setItem('ps_area_id', areaId);
    else areaId = localStorage.getItem('ps_area_id') || '';

    if (qrId) localStorage.setItem('ps_qr_id', qrId);
    else qrId = localStorage.getItem('ps_qr_id') || '';

    console.log('Contexto:', { storeId, areaId, qrId });

    // Validación temprana
    if (!storeId || !areaId) {
        console.warn('Faltan parámetros de tienda o área');
        document.getElementById('display_store').textContent = '⚠️ Enlace incompleto';
        document.getElementById('display_area').textContent = 'Escanee el QR nuevamente';
    }

    let deviceId = '';
    const feedbackForm = document.getElementById('feedbackForm');
    const successMessage = document.getElementById('successMessage');
    const cooldownMessage = document.getElementById('cooldownMessage');
    const detractorSection = document.getElementById('detractorSection');
    const deviceInfoEl = document.getElementById('device_info');

    // 2. Browser Fingerprinting & Fraud Check
    deviceId = await getFingerprint();
    deviceInfoEl.textContent = `Device: ${deviceId}`;

    // Master Mode Bypass Setup
    const masterBypassBtn = document.getElementById('masterBypassBtn');
    let isMasterMode = localStorage.getItem('ps_master_mode') === 'active';

    if (isMasterMode) masterBypassBtn.classList.add('active');

    masterBypassBtn.addEventListener('click', () => {
        const pass = prompt('Modo Maestro - Ingrese contraseña:');
        if (pass === '1972') {
            localStorage.setItem('ps_master_mode', 'active');
            isMasterMode = true;
            masterBypassBtn.classList.add('active');
            alert('¡Modo Maestro Activado! Bloqueo de 12h desactivado.');
            // Reload to apply bypass
            window.location.reload();
        } else if (pass !== null) {
            alert('Contraseña incorrecta');
        }
    });

    // Local Check
    if (!isMasterMode) {
        const lastSent = localStorage.getItem(`feedback_sent_${storeId}_${areaId}`);
        if (lastSent && (Date.now() - parseInt(lastSent) < 12 * 60 * 60 * 1000)) {
            feedbackForm.style.display = 'none';
            cooldownMessage.style.display = 'block';
            return;
        }
    }

    // DB Check
    if (!isMasterMode) {
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await _supabase
            .from('Feedback')
            .select('id')
            .eq('device_id', deviceId)
            .eq('tienda_id', storeId)
            .eq('area_id', areaId)
            .eq('tenant_id', window.tenantConfig.id)
            .gt('created_at', twelveHoursAgo)
            .limit(1);

        if (existing && existing.length > 0) {
            feedbackForm.style.display = 'none';
            cooldownMessage.style.display = 'block';
            return;
        }
    }

    // 3. Cargar nombres reales y pregunta
    if (storeId) {
        _supabase.from('Tiendas_Catalogo').select('nombre').eq('id', storeId).eq('tenant_id', window.tenantConfig.id).single()
            .then(({ data }) => { if (data) document.getElementById('display_store').textContent = data.nombre; });
    }
    if (areaId) {
        _supabase.from('Areas_Catalogo').select('nombre').eq('id', areaId).eq('tenant_id', window.tenantConfig.id).single()
            .then(({ data }) => { if (data) document.getElementById('display_area').textContent = data.nombre; });
        loadDynamicQuestion(areaId);
    }

    // 4. Emojis & Detractor Logic
    const emojiBtns = document.querySelectorAll('.emoji-btn');
    const satisfaccionInput = document.getElementById('satisfaccionInput');

    emojiBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            emojiBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            const val = parseInt(btn.dataset.value);
            satisfaccionInput.value = val;

            // Mostrar sección detractor si <= 2
            if (val <= 2) {
                detractorSection.style.display = 'block';
                document.getElementById('extraInfo').required = true;
            } else {
                detractorSection.style.display = 'none';
                document.getElementById('extraInfo').required = false;
            }
        });
    });

    // 5. Envío del Formulario
    feedbackForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rating = parseInt(satisfaccionInput.value);

        if (!rating) {
            alert('Por favor, selecciona una calificación.');
            return;
        }

        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.querySelector('.loader').style.display = 'inline-block';
        submitBtn.querySelector('span').innerText = 'Enviando...';

        const data = {
            id_qr: qrId,
            tienda_id: storeId,
            area_id: areaId,
            satisfaccion: rating,
            satisfaccion: rating,
            calidad_info: document.getElementById('dynamicQuestionInput')?.value || '', // Safe access
            comentario: document.getElementById('extraInfo')?.value || '',
            device_id: deviceId,
            tenant_id: window.tenantConfig.id
        };
        
        console.log('Enviando datos:', data);

        // Validación de datos críticos antes de enviar
        if (!data.tienda_id || !data.area_id) {
            alert('Error: No se identificó la sucursal o área. Por favor escanea el QR nuevamente.');
            submitBtn.disabled = false;
            submitBtn.querySelector('.loader').style.display = 'none';
            submitBtn.querySelector('span').innerText = 'Enviar opinión';
            return;
        }

        try {
            // A. Insert Feedback
            const { data: feedbackData, error } = await _supabase.from('Feedback').insert([data]).select();
            if (error) throw error;

            // B. Create Issue if Detractor
            if (rating <= 2 && feedbackData && feedbackData.length > 0) {
                const whatsapp = document.getElementById('whatsapp').value;
                const email = document.getElementById('email').value;
                const contactInfo = [
                    whatsapp && `WhatsApp: ${whatsapp}`,
                    email && `Email: ${email}`
                ].filter(Boolean).join(' | ') || 'No proporcionado';

                await _supabase.from('Issues').insert([{
                    feedback_id: feedbackData[0].id,
                    titulo: `Feedback Crítico: ${rating} Estrellas`,
                    descripcion: `Comentario: ${data.comentario}\nContacto: ${contactInfo}`,
                    categoria: 'Servicio',
                    severidad: rating === 1 ? 'Crítica' : 'Alta',
                    tienda_id: storeId,
                    area_id: areaId,
                    notas: contactInfo,
                    tenant_id: window.tenantConfig.id
                }]);
            }

            // Éxito
            localStorage.setItem(`feedback_sent_${storeId}_${areaId}`, Date.now().toString());
            feedbackForm.style.display = 'none';
            successMessage.style.display = 'block';
            window.scrollTo({ top: 0, behavior: 'smooth' });

        } catch (error) {
            console.error('Error Crítico:', error);
            
            let userMsg = 'Hubo un error al enviar tu comentario.';
            if (error.message) userMsg += `\nDetalle: ${error.message}`;
            if (error.details) userMsg += `\nInfo: ${error.details}`;
            
            alert(userMsg);
            
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
            .eq('tenant_id', window.tenantConfig.id)
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
