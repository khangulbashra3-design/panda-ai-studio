import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Film,
  Type,
  Scissors,
  ShoppingBag,
  User,
  CreditCard,
  Upload,
  Download,
  ArrowUp,
  ArrowDown,
  Trash2,
  Play,
  Volume2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

const VIDEO_STYLES = [
  'Premium / Apple',
  'Cinématique',
  'Publicité TikTok',
  'Minimaliste',
  'Luxe',
  'UGC',
  'Professionnel',
  'Créatif',
];

const DURATIONS = [
  { label: '15 secondes', seconds: 15 },
  { label: '30 secondes', seconds: 30 },
  { label: '45 secondes', seconds: 45 },
  { label: '1 minute', seconds: 60 },
  { label: '2 minutes', seconds: 120 },
  { label: '5 minutes', seconds: 300 },
  { label: '10 minutes', seconds: 600 },
  { label: '15 minutes', seconds: 900 },
];

const FORMATS = [
  { id: '9:16', label: 'TikTok vertical 9:16' },
  { id: '16:9', label: 'YouTube horizontal 16:9' },
  { id: '1:1', label: 'Carré 1:1' },
  { id: '4:5', label: 'Instagram 4:5' },
];

const TIKTOK_CATEGORIES = [
  'Vêtements',
  'Chaussures',
  'Accessoires',
  'Électronique',
  'Beauté',
];

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [token, setToken] = useState(() => localStorage.getItem('panda_token') || '');
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [systemStatus, setSystemStatus] = useState(null);
  const [plansData, setPlansData] = useState({ stripeConnected: false, plans: [] });
  const [assets, setAssets] = useState([]);
  const [projects, setProjects] = useState([]);

  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ fullName: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');

  const [genMode, setGenMode] = useState('image_to_video');
  const [genTitle, setGenTitle] = useState('');
  const [genPrompt, setGenPrompt] = useState('');
  const [genStyle, setGenStyle] = useState('Premium / Apple');
  const [genDuration, setGenDuration] = useState(15);
  const [genFormat, setGenFormat] = useState('9:16');
  const [genQuality, setGenQuality] = useState('720p');
  const [selectedAssetIds, setSelectedAssetIds] = useState([]);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState('');
  const [activeProject, setActiveProject] = useState(null);

  const [editTitle, setEditTitle] = useState('Publicité Montage Studio');
  const [timelineClips, setTimelineClips] = useState([]);
  const [editFormat, setEditFormat] = useState('9:16');
  const [editTransition, setEditTransition] = useState('fade');
  const [editZoom, setEditZoom] = useState(true);
  const [editOverlayText, setEditOverlayText] = useState('');
  const [editTextPosition, setEditTextPosition] = useState('bottom');
  const [editMusicAssetId, setEditMusicAssetId] = useState('');
  const [editOriginalVol, setEditOriginalVol] = useState(1.0);
  const [editMusicVol, setEditMusicVol] = useState(0.25);
  const [editVoiceGender, setEditVoiceGender] = useState('none');
  const [editLanguage, setEditLanguage] = useState('fr');
  const [editVoiceText, setEditVoiceText] = useState('');
  const [editAutoSubtitles, setEditAutoSubtitles] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [editResult, setEditResult] = useState(null);

  const [ttCategory, setTtCategory] = useState('Électronique');
  const [ttProductName, setTtProductName] = useState('');
  const [ttFeatures, setTtFeatures] = useState('');
  const [ttAudience, setTtAudience] = useState('');
  const [ttOffer, setTtOffer] = useState('');
  const [ttLoading, setTtLoading] = useState(false);
  const [ttError, setTtError] = useState('');
  const [ttResult, setTtResult] = useState(null);

  async function apiFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Erreur serveur (${res.status})`);
    }
    return data;
  }

  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then(setSystemStatus)
      .catch(() => {});

    fetch('/api/billing/plans')
      .then((r) => r.json())
      .then(setPlansData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    refreshUserData();
  }, [token]);

  async function refreshUserData() {
    try {
      const [meData, mediaData, projData] = await Promise.all([
        apiFetch('/api/auth/me'),
        apiFetch('/api/media'),
        apiFetch('/api/projects'),
      ]);
      setUser(meData.user);
      setTransactions(meData.transactions || []);
      setAssets(mediaData.assets || []);
      setProjects(projData.projects || []);
    } catch {
      logout();
    }
  }

  useEffect(() => {
    if (!activeProject || activeProject.status === 'completed' || activeProject.status === 'failed') {
      return;
    }
    const interval = setInterval(async () => {
      try {
        const data = await apiFetch(`/api/video/tasks/${activeProject.id}`);
        setActiveProject(data.project);
        if (data.project.status === 'completed' || data.project.status === 'failed') {
          refreshUserData();
        }
      } catch {
        clearInterval(interval);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [activeProject]);

  function logout() {
    localStorage.removeItem('panda_token');
    setToken('');
    setUser(null);
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError('');
    try {
      const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const data = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(authForm),
      });
      localStorage.setItem('panda_token', data.token);
      setToken(data.token);
      setUser(data.user);
      setActiveTab('studio');
    } catch (err) {
      setAuthError(err.message);
    }
  }

  async function handleFileUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!user) {
      setActiveTab('account');
      return;
    }
    if (files.length > 10) {
      alert('Maximum 10 fichiers simultanés.');
      return;
    }
    const formData = new FormData();
    for (const f of files) {
      formData.append('files', f);
    }
    try {
      const data = await apiFetch('/api/media/upload', {
        method: 'POST',
        body: formData,
      });
      setAssets((prev) => [...data.assets, ...prev]);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleGenerateVideo(e) {
    e.preventDefault();
    if (!user) {
      setActiveTab('account');
      return;
    }
    setGenError('');
    setGenLoading(true);
    try {
      const data = await apiFetch('/api/video/generate', {
        method: 'POST',
        body: JSON.stringify({
          mode: genMode,
          title: genTitle,
          promptText: genPrompt,
          style: genStyle,
          durationSeconds: genDuration,
          format: genFormat,
          quality: genQuality,
          assetIds: selectedAssetIds,
        }),
      });
      setActiveProject(data.project);
      refreshUserData();
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGenLoading(false);
    }
  }

  function addClipToTimeline(asset) {
    setTimelineClips((prev) => [
      ...prev,
      {
        uid: `${asset.id}-${Date.now()}-${Math.random()}`,
        assetId: asset.id,
        name: asset.original_name,
        mediaType: asset.media_type,
        trimStart: 0,
        duration: 4,
      },
    ]);
  }

  function moveClip(index, direction) {
    const nextIdx = index + direction;
    if (nextIdx < 0 || nextIdx >= timelineClips.length) return;
    const copy = [...timelineClips];
    const [removed] = copy.splice(index, 1);
    copy.splice(nextIdx, 0, removed);
    setTimelineClips(copy);
  }

  async function handleRenderEdit(e) {
    e.preventDefault();
    if (!user) {
      setActiveTab('account');
      return;
    }
    setEditError('');
    setEditResult(null);
    setEditLoading(true);
    try {
      const data = await apiFetch('/api/editor/render', {
        method: 'POST',
        body: JSON.stringify({
          title: editTitle,
          clips: timelineClips,
          aspectRatio: editFormat,
          transition: editTransition,
          zoomEffect: editZoom,
          overlayText: editOverlayText,
          textPosition: editTextPosition,
          musicAssetId: editMusicAssetId || null,
          originalVolume: Number(editOriginalVol),
          musicVolume: Number(editMusicVol),
          voiceGender: editVoiceGender,
          language: editLanguage,
          voiceoverText: editVoiceText,
          generateAutoSubtitles: editAutoSubtitles,
        }),
      });
      setEditResult(data.project);
      refreshUserData();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  }

  async function handleGenerateTikTok(e) {
    e.preventDefault();
    if (!user) {
      setActiveTab('account');
      return;
    }
    setTtError('');
    setTtLoading(true);
    try {
      const data = await apiFetch('/api/tiktok-shop/generate', {
        method: 'POST',
        body: JSON.stringify({
          category: ttCategory,
          productName: ttProductName,
          verifiedFeatures: ttFeatures,
          targetAudience: ttAudience,
          offerDetails: ttOffer,
        }),
      });
      setTtResult(data.result);
    } catch (err) {
      setTtError(err.message);
    } finally {
      setTtLoading(false);
    }
  }

  async function handleSubscribe(planId) {
    if (!user) {
      setActiveTab('account');
      return;
    }
    try {
      const data = await apiFetch('/api/billing/create-checkout-session', {
        method: 'POST',
        body: JSON.stringify({ planId }),
      });
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (err) {
      alert(err.message);
    }
  }

  const videoEngineConnected = systemStatus?.videoEngine?.connected;
  const audioEngineConnected = systemStatus?.audioAndCopyEngine?.connected;
  const ffmpegAvailable = systemStatus?.ffmpeg?.available;

  return (
    <div>
      <header className="navbar">
        <div className="brand" onClick={() => setActiveTab('home')}>
          <span>🐼 PANDA AI STUDIO</span>
        </div>

        <nav className="nav-tabs">
          <button className={`nav-tab ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
            Accueil
          </button>
          <button className={`nav-tab ${activeTab === 'studio' ? 'active' : ''}`} onClick={() => setActiveTab('studio')}>
            Génération IA
          </button>
          <button className={`nav-tab ${activeTab === 'editor' ? 'active' : ''}`} onClick={() => setActiveTab('editor')}>
            Montage Auto
          </button>
          <button className={`nav-tab ${activeTab === 'tiktok' ? 'active' : ''}`} onClick={() => setActiveTab('tiktok')}>
            TikTok Shop
          </button>
          <button className={`nav-tab ${activeTab === 'pricing' ? 'active' : ''}`} onClick={() => setActiveTab('pricing')}>
            Abonnements
          </button>
          <button className={`nav-tab ${activeTab === 'account' ? 'active' : ''}`} onClick={() => setActiveTab('account')}>
            {user ? 'Espace Personnel' : 'Connexion'}
          </button>
        </nav>

        <div className="user-pill">
          {user ? (
            <>
              <span className="credit-badge">{user.credits} crédits</span>
              <button className="btn btn-secondary" onClick={logout}>
                Déconnexion
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => setActiveTab('account')}>
              Commencer
            </button>
          )}
        </div>
      </header>

      <main className="container">
        {systemStatus && (
          <div className="status-bar">
            <div className="status-chip">
              <span className={`dot ${systemStatus.database?.connected ? 'ok' : 'warn'}`} />
              <span>{systemStatus.database?.message}</span>
            </div>
            <div className="status-chip">
              <span className={`dot ${videoEngineConnected ? 'ok' : 'warn'}`} />
              <span>{systemStatus.videoEngine?.message}</span>
            </div>
            <div className="status-chip">
              <span className={`dot ${ffmpegAvailable ? 'ok' : 'warn'}`} />
              <span>{ffmpegAvailable ? 'FFmpeg prêt pour montage MP4' : systemStatus.ffmpeg?.message}</span>
            </div>
            <div className="status-chip">
              <span className={`dot ${audioEngineConnected ? 'ok' : 'warn'}`} />
              <span>{systemStatus.audioAndCopyEngine?.message}</span>
            </div>
          </div>
        )}

        {activeTab === 'home' && (
          <div>
            <section className="hero">
              <h1>Une idée. Un produit. Une vidéo qui attire.</h1>
              <p>Crée des publicités professionnelles grâce à l&apos;intelligence artificielle.</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => setActiveTab('studio')}>
                  <Sparkles size={18} /> Créer une publicité IA
                </button>
                <button className="btn btn-secondary" onClick={() => setActiveTab('editor')}>
                  <Scissors size={18} /> Ouvrir le montage automatique
                </button>
              </div>
            </section>

            <div className="grid-3">
              <div
                className="card interactive"
                onClick={() => {
                  setGenMode('image_to_video');
                  setActiveTab('studio');
                }}
              >
                <Film size={28} color="#a855f7" style={{ marginBottom: 12 }} />
                <h3>1. Photos vers vidéo</h3>
                <p>Importez jusqu&apos;à 10 photos produit et animez-les en publicité verticale ou horizontale.</p>
              </div>

              <div className="card interactive" onClick={() => setActiveTab('editor')}>
                <Scissors size={28} color="#a855f7" style={{ marginBottom: 12 }} />
                <h3>2. Montage vidéo automatique</h3>
                <p>Coupez, réorganisez vos scènes, ajoutez musique, voix off, sous-titres et exportez en MP4.</p>
              </div>

              <div
                className="card interactive"
                onClick={() => {
                  setGenMode('text_to_video');
                  setActiveTab('studio');
                }}
              >
                <Type size={28} color="#a855f7" style={{ marginBottom: 12 }} />
                <h3>3. Texte vers vidéo</h3>
                <p>Décrivez votre scène publicitaire et laissez le moteur IA générer la vidéo.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'studio' && (
          <div className="grid-2">
            <div className="card">
              <h2 style={{ marginBottom: 16 }}>Studio de Génération Vidéo IA</h2>

              {!videoEngineConnected && (
                <div className="alert alert-warning">
                  <AlertTriangle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  Moteur IA non connecté : configurez <code>RUNWAY_API_KEY</code> côté serveur pour lancer des générations réelles.
                </div>
              )}

              {genError && <div className="alert alert-error">{genError}</div>}

              <form onSubmit={handleGenerateVideo}>
                <div className="form-group">
                  <label>Mode de création</label>
                  <div className="pill-group">
                    <button
                      type="button"
                      className={`pill-option ${genMode === 'image_to_video' ? 'selected' : ''}`}
                      onClick={() => setGenMode('image_to_video')}
                    >
                      Photos vers vidéo
                    </button>
                    <button
                      type="button"
                      className={`pill-option ${genMode === 'text_to_video' ? 'selected' : ''}`}
                      onClick={() => setGenMode('text_to_video')}
                    >
                      Texte vers vidéo
                    </button>
                    <button
                      type="button"
                      className={`pill-option ${genMode === 'video_to_video' ? 'selected' : ''}`}
                      onClick={() => setGenMode('video_to_video')}
                    >
                      Transformer une vidéo
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Titre du projet</label>
                  <input
                    type="text"
                    placeholder="Ex: Lancement écouteurs sans fil"
                    value={genTitle}
                    onChange={(e) => setGenTitle(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Description de la publicité</label>
                  <textarea
                    rows={4}
                    placeholder="Décrivez précisément le mouvement caméra, l'éclairage, le produit et l'ambiance..."
                    value={genPrompt}
                    onChange={(e) => setGenPrompt(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Style vidéo</label>
                  <div className="pill-group">
                    {VIDEO_STYLES.map((style) => (
                      <button
                        type="button"
                        key={style}
                        className={`pill-option ${genStyle === style ? 'selected' : ''}`}
                        onClick={() => setGenStyle(style)}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Format</label>
                  <div className="pill-group">
                    {FORMATS.map((fmt) => (
                      <button
                        type="button"
                        key={fmt.id}
                        className={`pill-option ${genFormat === fmt.id ? 'selected' : ''}`}
                        onClick={() => setGenFormat(fmt.id)}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Durée cible</label>
                  <select value={genDuration} onChange={(e) => setGenDuration(Number(e.target.value))}>
                    {DURATIONS.map((d) => (
                      <option key={d.seconds} value={d.seconds}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Qualité disponible</label>
                  <select value={genQuality} onChange={(e) => setGenQuality(e.target.value)}>
                    {(systemStatus?.videoEngine?.supportedQualities?.length
                      ? systemStatus.videoEngine.supportedQualities
                      : ['720p (Standard fournisseur)']
                    ).map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </div>

                <button type="submit" className="btn btn-primary" disabled={genLoading || !videoEngineConnected}>
                  <Sparkles size={16} />
                  {genLoading ? 'Envoi au moteur IA...' : 'Générer la vidéo'}
                </button>
              </form>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="card">
                <h3>Médias importés</h3>
                <p style={{ marginBottom: 14 }}>Sélectionnez une image ou vidéo source.</p>
                <label className="btn btn-secondary" style={{ cursor: 'pointer', marginBottom: 16 }}>
                  <Upload size={16} /> Importer des fichiers
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>

                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {assets.length === 0 && <p>Aucun fichier importé.</p>}
                  {assets.map((asset) => {
                    const isSelected = selectedAssetIds.includes(asset.id);
                    return (
                      <div key={asset.id} className="timeline-item">
                        <div>
                          <strong>{asset.original_name}</strong>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            Type : {asset.media_type}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() =>
                            setSelectedAssetIds((prev) =>
                              prev.includes(asset.id) ? prev.filter((id) => id !== asset.id) : [asset.id]
                            )
                          }
                        >
                          {isSelected ? 'Sélectionné' : 'Utiliser'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {activeProject && (
                <div className="card">
                  <h3>Suivi de génération en temps réel</h3>
                  <p>Projet : {activeProject.title}</p>
                  <p>Statut : <strong>{activeProject.status}</strong> ({activeProject.progress}%)</p>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${activeProject.progress}%` }} />
                  </div>
                  {activeProject.error_message && (
                    <div className="alert alert-error">{activeProject.error_message}</div>
                  )}
                  {activeProject.output_url && (
                    <div>
                      <video className="preview-player" src={activeProject.output_url} controls />
                      <a
                        href={activeProject.output_url}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-primary"
                        style={{ marginTop: 12 }}
                      >
                        <Download size={16} /> Télécharger la vidéo
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'editor' && (
          <div className="grid-2">
            <div className="card">
              <h2 style={{ marginBottom: 14 }}>Montage Vidéo Automatique (FFmpeg)</h2>

              {!ffmpegAvailable && (
                <div className="alert alert-error">{systemStatus?.ffmpeg?.message}</div>
              )}
              {editError && <div className="alert alert-error">{editError}</div>}

              <form onSubmit={handleRenderEdit}>
                <div className="form-group">
                  <label>Nom de l&apos;export</label>
                  <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Scènes de la timeline</label>
                  {timelineClips.length === 0 && (
                    <p style={{ fontSize: '0.86rem' }}>
                      Ajoutez des vidéos ou photos depuis la bibliothèque à droite.
                    </p>
                  )}
                  {timelineClips.map((clip, idx) => (
                    <div key={clip.uid} className="timeline-item">
                      <div style={{ flex: 1 }}>
                        <strong>
                          #{idx + 1} — {clip.name}
                        </strong>
                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                          <label style={{ fontSize: '0.75rem' }}>
                            Début (s)
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={clip.trimStart}
                              onChange={(e) => {
                                const copy = [...timelineClips];
                                copy[idx].trimStart = Number(e.target.value);
                                setTimelineClips(copy);
                              }}
                              style={{ width: 75, padding: '4px 8px' }}
                            />
                          </label>
                          <label style={{ fontSize: '0.75rem' }}>
                            Durée (s)
                            <input
                              type="number"
                              min="1"
                              max="120"
                              step="0.5"
                              value={clip.duration}
                              onChange={(e) => {
                                const copy = [...timelineClips];
                                copy[idx].duration = Number(e.target.value);
                                setTimelineClips(copy);
                              }}
                              style={{ width: 75, padding: '4px 8px' }}
                            />
                          </label>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-secondary" onClick={() => moveClip(idx, -1)}>
                          <ArrowUp size={14} />
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => moveClip(idx, 1)}>
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => setTimelineClips((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="form-group">
                  <label>Format d&apos;export MP4</label>
                  <select value={editFormat} onChange={(e) => setEditFormat(e.target.value)}>
                    {FORMATS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Transition & Zoom dynamique</label>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <select value={editTransition} onChange={(e) => setEditTransition(e.target.value)} style={{ flex: 1 }}>
                      <option value="fade">Fondu enchaîné (Fade)</option>
                      <option value="none">Coupe franche</option>
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={editZoom} onChange={(e) => setEditZoom(e.target.checked)} />
                      Zoom progressif
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label>Texte animé incrusté</label>
                  <input
                    type="text"
                    placeholder="Ex: -30% aujourd'hui uniquement"
                    value={editOverlayText}
                    onChange={(e) => setEditOverlayText(e.target.value)}
                  />
                  <select
                    value={editTextPosition}
                    onChange={(e) => setEditTextPosition(e.target.value)}
                    style={{ marginTop: 8 }}
                  >
                    <option value="bottom">Position : Bas</option>
                    <option value="center">Position : Centre</option>
                    <option value="top">Position : Haut</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Musique de fond & Volumes</label>
                  <select value={editMusicAssetId} onChange={(e) => setEditMusicAssetId(e.target.value)}>
                    <option value="">Aucune musique</option>
                    {assets
                      .filter((a) => a.media_type === 'audio')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.original_name}
                        </option>
                      ))}
                  </select>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label>Volume original ({Math.round(editOriginalVol * 100)}%)</label>
                      <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.05"
                        value={editOriginalVol}
                        onChange={(e) => setEditOriginalVol(e.target.value)}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Volume musique ({Math.round(editMusicVol * 100)}%)</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={editMusicVol}
                        onChange={(e) => setEditMusicVol(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>Voix off & Sous-titres automatiques</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <select value={editVoiceGender} onChange={(e) => setEditVoiceGender(e.target.value)}>
                      <option value="none">Sans voix</option>
                      {audioEngineConnected && (
                        <>
                          <option value="female">Voix féminine</option>
                          <option value="male">Voix masculine</option>
                        </>
                      )}
                    </select>
                    <select value={editLanguage} onChange={(e) => setEditLanguage(e.target.value)}>
                      <option value="fr">Français</option>
                      <option value="en">Anglais</option>
                      <option value="ar">Arabe</option>
                      <option value="es">Espagnol</option>
                    </select>
                  </div>

                  {editVoiceGender !== 'none' && (
                    <textarea
                      rows={3}
                      placeholder="Texte à lire par la voix off..."
                      value={editVoiceText}
                      onChange={(e) => setEditVoiceText(e.target.value)}
                    />
                  )}

                  {audioEngineConnected && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <input
                        type="checkbox"
                        checked={editAutoSubtitles}
                        onChange={(e) => setEditAutoSubtitles(e.target.checked)}
                      />
                      Générer et incruster les sous-titres automatiquement
                    </label>
                  )}
                </div>

                <button type="submit" className="btn btn-primary" disabled={editLoading || !ffmpegAvailable}>
                  <Play size={16} />
                  {editLoading ? 'Rendu FFmpeg en cours...' : 'Exporter en MP4'}
                </button>
              </form>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="card">
                <h3>Médias disponibles</h3>
                <label className="btn btn-secondary" style={{ cursor: 'pointer', margin: '12px 0' }}>
                  <Upload size={16} /> Importer des médias
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*,audio/*"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>

                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {assets.map((asset) => (
                    <div key={asset.id} className="timeline-item">
                      <div>
                        <strong>{asset.original_name}</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {asset.media_type}
                        </div>
                      </div>
                      {asset.media_type !== 'audio' && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => addClipToTimeline(asset)}
                        >
                          + Ajouter scène
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {editResult && (
                <div className="card">
                  <h3>Vidéo MP4 exportée</h3>
                  <video className="preview-player" src={editResult.output_url} controls />
                  <a href={editResult.output_url} download className="btn btn-primary" style={{ marginTop: 12 }}>
                    <Download size={16} /> Télécharger le MP4
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'tiktok' && (
          <div className="grid-2">
            <div className="card">
              <h2 style={{ marginBottom: 10 }}>
                <ShoppingBag size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                Studio Créateurs TikTok Shop
              </h2>
              <p style={{ marginBottom: 16 }}>
                Renseignez uniquement les caractéristiques réelles de votre produit.
              </p>

              {!audioEngineConnected && (
                <div className="alert alert-warning">
                  Configurez <code>OPENAI_API_KEY</code> côté serveur pour activer le générateur de scripts.
                </div>
              )}
              {ttError && <div className="alert alert-error">{ttError}</div>}

              <form onSubmit={handleGenerateTikTok}>
                <div className="form-group">
                  <label>Catégorie</label>
                  <div className="pill-group">
                    {TIKTOK_CATEGORIES.map((cat) => (
                      <button
                        type="button"
                        key={cat}
                        className={`pill-option ${ttCategory === cat ? 'selected' : ''}`}
                        onClick={() => setTtCategory(cat)}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Nom exact du produit</label>
                  <input
                    type="text"
                    placeholder="Ex: Mini projecteur LED portable"
                    value={ttProductName}
                    onChange={(e) => setTtProductName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Caractéristiques vérifiées</label>
                  <textarea
                    rows={4}
                    placeholder="Ex: Résolution native 720p, connexion Wi-Fi et HDMI, poids 480g."
                    value={ttFeatures}
                    onChange={(e) => setTtFeatures(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Public cible</label>
                  <input
                    type="text"
                    placeholder="Ex: Étudiants, amateurs de cinéma en chambre"
                    value={ttAudience}
                    onChange={(e) => setTtAudience(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Offre commerciale (optionnel)</label>
                  <input
                    type="text"
                    placeholder="Ex: Livraison gratuite via le panier orange"
                    value={ttOffer}
                    onChange={(e) => setTtOffer(e.target.value)}
                  />
                </div>

                <button type="submit" className="btn btn-primary" disabled={ttLoading || !audioEngineConnected}>
                  <Sparkles size={16} />
                  {ttLoading ? 'Rédaction des variantes...' : 'Générer les scripts TikTok Shop'}
                </button>
              </form>
            </div>

            <div className="card">
              <h3>Résultats & Variantes publicitaires</h3>
              {!ttResult && <p>Complétez la fiche produit pour obtenir vos scripts.</p>}

              {ttResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <strong style={{ color: '#d8b4fe' }}>Accroches (0 à 3 secondes) :</strong>
                    <ul style={{ paddingLeft: 18, marginTop: 6 }}>
                      {ttResult.hooks_3s?.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <strong style={{ color: '#d8b4fe' }}>Avantages factuels :</strong>
                    <ul style={{ paddingLeft: 18, marginTop: 6 }}>
                      {ttResult.benefits?.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <strong style={{ color: '#d8b4fe' }}>Description & Hashtags :</strong>
                    <p style={{ marginTop: 4 }}>{ttResult.description}</p>
                    <p style={{ color: '#c4b5fd', marginTop: 4 }}>{ttResult.hashtags?.join(' ')}</p>
                  </div>

                  <div>
                    <strong style={{ color: '#d8b4fe' }}>Appels à l&apos;action (CTA) :</strong>
                    <ul style={{ paddingLeft: 18, marginTop: 6 }}>
                      {ttResult.ctas?.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>

                  {ttResult.variants?.map((v, i) => (
                    <div key={i} className="timeline-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                      <strong>{v.title}</strong>
                      <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem' }}>{v.script}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'pricing' && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <h2>Formules & Crédits Studio</h2>
              <p>Tarifs configurables par l&apos;administrateur. Paiements sécurisés par Stripe.</p>
              {!plansData.stripeConnected && (
                <div className="alert alert-warning" style={{ maxWidth: 640, margin: '14px auto 0' }}>
                  Stripe n&apos;est pas connecté (<code>STRIPE_SECRET_KEY</code> manquante).
                </div>
              )}
            </div>

            <div className="grid-3">
              {plansData.plans.map((plan) => (
                <div key={plan.id} className="card">
                  <h3>{plan.name}</h3>
                  <div style={{ fontSize: '2rem', fontWeight: 700, margin: '10px 0' }}>
                    {plan.priceEur} € <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>/ mois</span>
                  </div>
                  <p style={{ color: '#d8b4fe', fontWeight: 600, marginBottom: 14 }}>{plan.credits} crédits inclus</p>
                  <ul style={{ paddingLeft: 18, color: 'var(--text-secondary)', marginBottom: 20 }}>
                    {plan.features.map((f, idx) => (
                      <li key={idx} style={{ marginBottom: 6 }}>
                        {f}
                      </li>
                    ))}
                  </ul>
                  {plan.id === 'free' ? (
                    <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setActiveTab('account')}>
                      Inclus à l&apos;inscription
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%' }}
                      disabled={!plan.stripeConfigured}
                      onClick={() => handleSubscribe(plan.id)}
                    >
                      <CreditCard size={16} />
                      {plan.stripeConfigured ? `Choisir ${plan.name}` : 'Stripe non configuré'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'account' && (
          <div>
            {!user ? (
              <div className="card" style={{ maxWidth: 460, margin: '0 auto' }}>
                <h2 style={{ marginBottom: 14 }}>
                  {authMode === 'login' ? 'Connexion à PANDA AI STUDIO' : 'Créer un compte'}
                </h2>
                {authError && <div className="alert alert-error">{authError}</div>}
                <form onSubmit={handleAuthSubmit}>
                  {authMode === 'register' && (
                    <div className="form-group">
                      <label>Nom complet</label>
                      <input
                        type="text"
                        required
                        value={authForm.fullName}
                        onChange={(e) => setAuthForm({ ...authForm, fullName: e.target.value })}
                      />
                    </div>
                  )}
                  <div className="form-group">
                    <label>Adresse e-mail</label>
                    <input
                      type="email"
                      required
                      value={authForm.email}
                      onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Mot de passe (8 caractères minimum)</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={authForm.password}
                      onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                    {authMode === 'login' ? 'Se connecter' : 'Créer mon compte'}
                  </button>
                </form>

                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%', marginTop: 12 }}
                  onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                >
                  {authMode === 'login' ? "Pas encore de compte ? S'inscrire" : 'Déjà inscrit ? Se connecter'}
                </button>
              </div>
            ) : (
              <div className="grid-2">
                <div className="card">
                  <h3>
                    <User size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                    Profil & Crédits
                  </h3>
                  <p style={{ marginTop: 10 }}>
                    <strong>Nom :</strong> {user.full_name}
                  </p>
                  <p>
                    <strong>E-mail :</strong> {user.email}
                  </p>
                  <p>
                    <strong>Formule actuelle :</strong> {user.plan.toUpperCase()}
                  </p>
                  <p>
                    <strong>Solde de crédits :</strong> {user.credits} crédits
                  </p>

                  <h4 style={{ marginTop: 20, marginBottom: 10 }}>Historique des crédits</h4>
                  {transactions.map((tx) => (
                    <div key={tx.id} className="timeline-item">
                      <span>{tx.reason}</span>
                      <strong style={{ color: tx.amount >= 0 ? 'var(--success)' : 'var(--warning)' }}>
                        {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                      </strong>
                    </div>
                  ))}
                </div>

                <div className="card">
                  <h3>Historique des projets & vidéos</h3>
                  {projects.length === 0 && <p style={{ marginTop: 10 }}>Aucun projet généré pour le moment.</p>}
                  {projects.map((proj) => (
                    <div key={proj.id} className="timeline-item">
                      <div>
                        <strong>{proj.title}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          Outil : {proj.tool_type} • Statut : {proj.status}
                        </div>
                      </div>
                      {proj.output_url && (
                        <a href={proj.output_url} download target="_blank" rel="noreferrer" className="btn btn-primary">
                          <Download size={14} /> MP4
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
