import { useState, useEffect, useRef } from 'react';
import {
  PlusIcon, PencilIcon, TrashIcon, StarIcon,
  FolderOpenIcon, DocumentDuplicateIcon, ArrowTopRightOnSquareIcon,
  ChatBubbleBottomCenterTextIcon, CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';
import { profileAPI, cvDocumentAPI, applicationAPI } from '../services/ipc.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { useToast } from '../contexts/ToastContext.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import './CVLibrary.css';

const SELECTED_KEY = 'cvlib_selectedProfileId';

const UNORGANISED = 'unorganised'; // sentinel — not a real profile ID

// Persist and restore which profile (or 'unorganised') is selected so
// navigating away and back keeps the user on the same panel.
function readStoredId() {
  const v = sessionStorage.getItem(SELECTED_KEY);
  if (!v) return null;
  if (v === UNORGANISED) return UNORGANISED;
  const n = parseInt(v);
  return isNaN(n) ? null : n;
}
function storeId(id) {
  if (id != null) sessionStorage.setItem(SELECTED_KEY, String(id));
  else sessionStorage.removeItem(SELECTED_KEY);
}

export default function CVLibrary({ onNavigate }) {
  const [profiles, setProfiles]           = useState([]);
  const [cvDocuments, setCvDocuments]     = useState([]);
  const [applications, setApplications]   = useState([]);
  const [selectedId, setSelectedId]       = useState(readStoredId);
  const [loading, setLoading]             = useState(true);
  const [showModal, setShowModal]         = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editingCvDoc, setEditingCvDoc]   = useState(null);
  const [selectMode, setSelectMode]       = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const { showToast } = useToast();

  useEffect(() => { loadAll(); }, []);

  function selectProfile(id) {
    setSelectedId(id);
    storeId(id);
    setSelectedDocIds(new Set());
  }

  function toggleSelectMode() {
    setSelectMode(m => !m);
    setSelectedDocIds(new Set());
  }

  function toggleDocSelected(id) {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function setDocsSelected(ids, selected) {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id); else next.delete(id);
      }
      return next;
    });
  }

  async function loadAll() {
    try {
      setLoading(true);
      const [p, d, apps] = await Promise.all([profileAPI.list(), cvDocumentAPI.list(), applicationAPI.list()]);
      setProfiles(p);
      setCvDocuments(d);
      setApplications(apps);

      const unorganised = d.filter(doc => !doc.profile_id);
      const stored = readStoredId();

      let valid;
      if (stored === UNORGANISED && unorganised.length > 0) {
        valid = UNORGANISED;
      } else if (stored && stored !== UNORGANISED && p.some(pr => pr.id === stored)) {
        valid = stored;
      } else if (p.length > 0) {
        valid = p[0].id;
      } else if (unorganised.length > 0) {
        valid = UNORGANISED;
      } else {
        valid = null;
      }

      setSelectedId(valid);
      storeId(valid);
    } catch (err) {
      showToast('Failed to load library: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Profile actions ──────────────────────────────────────────────────────────

  async function handleSaveProfile(name, description) {
    try {
      if (editingProfile) {
        await profileAPI.update(editingProfile.id, name, description);
      } else {
        const { id } = await profileAPI.create(name, description);
        selectProfile(id);
      }
      setShowModal(false);
      setEditingProfile(null);
      await loadAll();
      showToast(editingProfile ? 'Profile updated' : 'Profile created');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleDeleteProfile(id) {
    try {
      await profileAPI.delete(id);
      if (selectedId === id) selectProfile(null);
      await loadAll();
      showToast('Profile deleted');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDeleteConfirm(null);
    }
  }

  // ── CV Document actions ──────────────────────────────────────────────────────

  async function handleSetPrimaryCv(profileId, cvDocId) {
    try {
      await profileAPI.setBaseCv(profileId, cvDocId);
      await loadAll();
      showToast('Primary CV updated');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleDeleteCvDoc(id) {
    try {
      await cvDocumentAPI.delete(id);
      await loadAll();
      showToast('CV deleted');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDeleteConfirm(null);
    }
  }

  // Move a CV to a different profile (or to unorganised when newProfileId is null).
  async function handleMoveCvDoc(docId, newProfileId) {
    try {
      await cvDocumentAPI.update(docId, { profile_id: newProfileId });
      await loadAll();
      showToast(newProfileId ? 'Moved to profile' : 'Moved to unorganised');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleEditCvDetails(docId, newTitle, newNotes) {
    try {
      await cvDocumentAPI.update(docId, { title: newTitle, notes: newNotes });
      await loadAll();
      showToast('CV updated');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setEditingCvDoc(null);
    }
  }

  function handleOpenCv(docId) {
    onNavigate('assembly', { documentId: docId });
  }

  async function handleCloneCv(doc) {
    try {
      const full = await cvDocumentAPI.get(doc.id);
      const { id } = await cvDocumentAPI.create({
        title:        `${doc.title} (copy)`,
        content_html: full.content_html || '',
        profile_id:   doc.profile_id,
        job_ad_text:  full.job_ad_text  || '',
      });
      await loadAll();
      showToast('CV copied');
      onNavigate('assembly', { documentId: id });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function handleNewCv(profileId = null) {
    onNavigate('assembly', { newDocument: true, profileId: profileId ?? undefined });
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────────

  async function handleBulkMove(newProfileId) {
    const ids = [...selectedDocIds];
    try {
      await cvDocumentAPI.batchMove(ids, newProfileId);
      setSelectedDocIds(new Set());
      await loadAll();
      showToast(newProfileId ? `Moved ${ids.length} CV(s) to profile` : `Moved ${ids.length} CV(s) to unorganised`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedDocIds];
    try {
      await cvDocumentAPI.batchDelete(ids);
      setSelectedDocIds(new Set());
      await loadAll();
      showToast(`Deleted ${ids.length} CV(s)`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBulkDeleteConfirm(false);
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  const selectedProfile = profiles.find(p => p.id === selectedId) ?? null;
  const profileDocs     = cvDocuments.filter(d => d.profile_id === selectedId);
  const primaryDocs     = profileDocs.filter(d => d.is_base);
  const variantDocs     = profileDocs.filter(d => !d.is_base);
  const unorganisedDocs = cvDocuments.filter(d => !d.profile_id);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <div className="cvlib-loading">Loading…</div>;

  return (
    <div className="cvlib">

      <div className="cvlib-header">
        <div>
          <h1 className="cvlib-title">CV Library</h1>
          <p className="cvlib-subtitle">Organise your CVs into role profiles</p>
        </div>
        <div className="cvlib-header-actions">
          <button
            className={`btn btn-sm btn-with-icon ${selectMode ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={toggleSelectMode}
          >
            <CheckCircleIcon className="icon" /> {selectMode ? 'Cancel selection' : 'Select'}
          </button>
          <button className="btn btn-primary btn-sm btn-with-icon" onClick={() => handleNewCv(null)}>
            <PlusIcon className="icon" /> New CV
          </button>
        </div>
      </div>

      <div className="cvlib-body">

        {/* Left: profile list */}
        <aside className="cvlib-sidebar">
          <div className="cvlib-sidebar-header">
            <span className="cvlib-section-label">Profiles</span>
            <button
              className="btn btn-ghost btn-sm btn-with-icon"
              onClick={() => { setEditingProfile(null); setShowModal(true); }}
              title="New profile"
            >
              <PlusIcon className="icon" /> New
            </button>
          </div>

          {profiles.length === 0 && unorganisedDocs.length === 0 ? (
            <p className="cvlib-empty-hint">
              No profiles yet. Create one to group your CVs by role type.
            </p>
          ) : (
            <ul className="cvlib-profile-list">
              {profiles.map(p => (
                <li key={p.id}>
                  <button
                    className={`cvlib-profile-btn${p.id === selectedId ? ' selected' : ''}`}
                    onClick={() => selectProfile(p.id)}
                  >
                    <span className="cvlib-profile-name">{p.name}</span>
                    <span className="cvlib-profile-count">
                      {cvDocuments.filter(d => d.profile_id === p.id).length}
                    </span>
                  </button>
                </li>
              ))}
              {unorganisedDocs.length > 0 && (
                <li>
                  <button
                    className={`cvlib-profile-btn cvlib-profile-btn-unorganised${selectedId === UNORGANISED ? ' selected' : ''}`}
                    onClick={() => selectProfile(UNORGANISED)}
                  >
                    <span className="cvlib-profile-name">Unorganised</span>
                    <span className="cvlib-profile-count">{unorganisedDocs.length}</span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </aside>

        {/* Right: profile detail */}
        <div className="cvlib-detail">
          {selectedId === UNORGANISED ? (
            <UnorganisedDetail
              docs={unorganisedDocs}
              profiles={profiles}
              onOpen={handleOpenCv}
              onClone={handleCloneCv}
              onMove={handleMoveCvDoc}
              onEditDetails={setEditingCvDoc}
              onDeleteDoc={(id, title) => setDeleteConfirm({ type: 'doc', id, name: title, linkedApps: applications.filter(a => a.cv_document_id === id).length })}
              onNewCv={() => handleNewCv(null)}
              selectMode={selectMode}
              selectedDocIds={selectedDocIds}
              onToggleDocSelected={toggleDocSelected}
              onSetDocsSelected={setDocsSelected}
              onBulkMove={handleBulkMove}
              onBulkDelete={() => setBulkDeleteConfirm(true)}
            />
          ) : selectedProfile ? (
            <ProfileDetail
              profile={selectedProfile}
              primaryDocs={primaryDocs}
              variantDocs={variantDocs}
              profiles={profiles}
              onEdit={() => { setEditingProfile(selectedProfile); setShowModal(true); }}
              onDelete={() => setDeleteConfirm({ type: 'profile', id: selectedProfile.id, name: selectedProfile.name })}
              onSetPrimary={handleSetPrimaryCv}
              onOpen={handleOpenCv}
              onClone={handleCloneCv}
              onMove={handleMoveCvDoc}
              onEditDetails={setEditingCvDoc}
              onDeleteDoc={(id, title) => setDeleteConfirm({ type: 'doc', id, name: title, linkedApps: applications.filter(a => a.cv_document_id === id).length })}
              onNewCv={() => handleNewCv(selectedProfile.id)}
              selectMode={selectMode}
              selectedDocIds={selectedDocIds}
              onToggleDocSelected={toggleDocSelected}
              onSetDocsSelected={setDocsSelected}
              onBulkMove={handleBulkMove}
              onBulkDelete={() => setBulkDeleteConfirm(true)}
            />
          ) : (
            <div className="cvlib-no-selection">
              <FolderOpenIcon className="cvlib-no-selection-icon" />
              <p>Select a profile to see its CVs, or create a new profile.</p>
            </div>
          )}
        </div>

      </div>

      {showModal && (
        <ProfileModal
          profile={editingProfile}
          onSave={handleSaveProfile}
          onClose={() => { setShowModal(false); setEditingProfile(null); }}
        />
      )}

      {editingCvDoc && (
        <EditCvDetailsModal
          doc={editingCvDoc}
          onSave={handleEditCvDetails}
          onClose={() => setEditingCvDoc(null)}
        />
      )}

      {deleteConfirm && (() => {
        const isProfile = deleteConfirm.type === 'profile';
        const linkedApps = deleteConfirm.linkedApps ?? 0;
        return (
          <ConfirmDialog
            title={`Delete ${isProfile ? 'profile' : 'CV'}?`}
            body={
              <>
                <p>
                  {isProfile
                    ? <>Deleting <strong>{deleteConfirm.name}</strong> will remove the profile. CVs in this profile will become unorganised but will not be deleted.</>
                    : <>Delete <strong>{deleteConfirm.name}</strong>? This cannot be undone.</>
                  }
                </p>
                {!isProfile && linkedApps > 0 && (
                  <p className="modal-dialog-warning">
                    This CV is linked to {linkedApps} application{linkedApps !== 1 ? 's' : ''}.
                    Deleting it will remove the link — the application record will remain but without a CV attached.
                  </p>
                )}
              </>
            }
            confirmLabel="Delete"
            onConfirm={() => isProfile
              ? handleDeleteProfile(deleteConfirm.id)
              : handleDeleteCvDoc(deleteConfirm.id)
            }
            onCancel={() => setDeleteConfirm(null)}
          />
        );
      })()}

      {bulkDeleteConfirm && (() => {
        const count = selectedDocIds.size;
        const linkedApps = applications.filter(a => selectedDocIds.has(a.cv_document_id)).length;
        return (
          <ConfirmDialog
            title={`Delete ${count} CV${count !== 1 ? 's' : ''}?`}
            body={
              <>
                <p>This cannot be undone.</p>
                {linkedApps > 0 && (
                  <p className="modal-dialog-warning">
                    {linkedApps} of these CV{linkedApps !== 1 ? 's are' : ' is'} linked to an application.
                    Deleting {linkedApps !== 1 ? 'them' : 'it'} will remove the link — the application record will remain but without a CV attached.
                  </p>
                )}
              </>
            }
            confirmLabel="Delete"
            onConfirm={handleBulkDelete}
            onCancel={() => setBulkDeleteConfirm(false)}
          />
        );
      })()}

    </div>
  );
}

// ── UnorganisedDetail ─────────────────────────────────────────────────────────

function UnorganisedDetail({ docs, profiles, onOpen, onClone, onMove, onEditDetails, onDeleteDoc, onNewCv,
                              selectMode, selectedDocIds, onToggleDocSelected, onSetDocsSelected, onBulkMove, onBulkDelete }) {
  const docIds = docs.map(d => d.id);
  return (
    <section className="cvlib-profile-detail">
      <div className="cvlib-profile-detail-header">
        <div>
          <h2 className="cvlib-profile-detail-name">Unorganised CVs</h2>
          <p className="cvlib-profile-detail-desc">These CVs are not assigned to any profile.</p>
        </div>
      </div>
      {selectMode && (
        <BulkToolbar
          ids={docIds}
          selectedDocIds={selectedDocIds}
          onSetDocsSelected={onSetDocsSelected}
          profiles={profiles}
          currentProfileId={null}
          onBulkMove={onBulkMove}
          onBulkDelete={onBulkDelete}
        />
      )}
      <ul className="cvlib-doc-list">
        {docs.map(doc => (
          <CvDocRow
            key={doc.id}
            doc={doc}
            isPrimary={false}
            showSetPrimary={false}
            profiles={profiles}
            onOpen={() => onOpen(doc.id)}
            onClone={() => onClone(doc)}
            onMove={onMove}
            onEditDetails={() => onEditDetails(doc)}
            onDelete={() => onDeleteDoc(doc.id, doc.title)}
            selectMode={selectMode}
            selected={selectedDocIds.has(doc.id)}
            onToggleSelect={() => onToggleDocSelected(doc.id)}
          />
        ))}
      </ul>
      <button className="btn btn-ghost btn-sm btn-with-icon cvlib-new-cv-btn" onClick={onNewCv}>
        <PlusIcon className="icon" /> New CV (unorganised)
      </button>
    </section>
  );
}

// ── ProfileDetail ─────────────────────────────────────────────────────────────

function ProfileDetail({ profile, primaryDocs, variantDocs, profiles, onEdit, onDelete,
                         onSetPrimary, onOpen, onClone, onMove, onEditDetails, onDeleteDoc, onNewCv,
                         selectMode, selectedDocIds, onToggleDocSelected, onSetDocsSelected, onBulkMove, onBulkDelete }) {
  const docIds = [...primaryDocs, ...variantDocs].map(d => d.id);
  return (
    <section className="cvlib-profile-detail">
      <div className="cvlib-profile-detail-header">
        <div>
          <h2 className="cvlib-profile-detail-name">{profile.name}</h2>
          {profile.description && (
            <p className="cvlib-profile-detail-desc">{profile.description}</p>
          )}
        </div>
        <div className="cvlib-profile-detail-actions">
          <button className="btn btn-ghost btn-sm btn-with-icon" onClick={onEdit}>
            <PencilIcon className="icon" /> Edit
          </button>
          <button className="btn btn-danger btn-sm btn-with-icon" onClick={onDelete}>
            <TrashIcon className="icon" /> Delete profile
          </button>
        </div>
      </div>

      {selectMode && (
        <BulkToolbar
          ids={docIds}
          selectedDocIds={selectedDocIds}
          onSetDocsSelected={onSetDocsSelected}
          profiles={profiles}
          currentProfileId={profile.id}
          onBulkMove={onBulkMove}
          onBulkDelete={onBulkDelete}
        />
      )}

      <div className="cvlib-subsection">
        <h3 className="cvlib-subsection-heading">
          <StarSolid className="cvlib-star-icon" /> Primary CV
        </h3>
        <p className="cvlib-subsection-desc">Your go-to draft for this profile — the baseline you tailor variants from.</p>
        {primaryDocs.length === 0 ? (
          <p className="cvlib-empty-hint">
            No primary CV set. Open any variant and star it to feature it here.
          </p>
        ) : (
          <ul className="cvlib-doc-list">
            {primaryDocs.map(doc => (
              <CvDocRow key={doc.id} doc={doc} isPrimary={true} showSetPrimary={false}
                profiles={profiles}
                onOpen={() => onOpen(doc.id)} onClone={() => onClone(doc)}
                onMove={onMove} onEditDetails={() => onEditDetails(doc)}
                onDelete={() => onDeleteDoc(doc.id, doc.title)}
                selectMode={selectMode}
                selected={selectedDocIds.has(doc.id)}
                onToggleSelect={() => onToggleDocSelected(doc.id)} />
            ))}
          </ul>
        )}
      </div>

      <div className="cvlib-subsection">
        <h3 className="cvlib-subsection-heading">
          Variants {variantDocs.length > 0 && <span className="cvlib-count-badge">{variantDocs.length}</span>}
        </h3>
        {variantDocs.length === 0 ? (
          <p className="cvlib-empty-hint">No variants yet.</p>
        ) : (
          <ul className="cvlib-doc-list">
            {variantDocs.map(doc => (
              <CvDocRow key={doc.id} doc={doc} isPrimary={false} showSetPrimary={true}
                profiles={profiles}
                onSetPrimary={() => onSetPrimary(profile.id, doc.id)}
                onOpen={() => onOpen(doc.id)} onClone={() => onClone(doc)}
                onMove={onMove} onEditDetails={() => onEditDetails(doc)}
                onDelete={() => onDeleteDoc(doc.id, doc.title)}
                selectMode={selectMode}
                selected={selectedDocIds.has(doc.id)}
                onToggleSelect={() => onToggleDocSelected(doc.id)} />
            ))}
          </ul>
        )}
      </div>

      <button className="btn btn-ghost btn-sm btn-with-icon cvlib-new-cv-btn" onClick={onNewCv}>
        <PlusIcon className="icon" /> New CV in this profile
      </button>
    </section>
  );
}

// ── BulkToolbar ───────────────────────────────────────────────────────────────

function BulkToolbar({ ids, selectedDocIds, onSetDocsSelected, profiles, currentProfileId, onBulkMove, onBulkDelete }) {
  const selectedInList = ids.filter(id => selectedDocIds.has(id));
  const allSelected = ids.length > 0 && selectedInList.length === ids.length;
  const someSelected = selectedInList.length > 0 && !allSelected;
  const checkboxRef = useRef(null);

  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const moveTargets = (profiles || []).filter(p => p.id !== currentProfileId);

  function handleMoveChange(e) {
    const val = e.target.value;
    if (!val) return;
    onBulkMove(val === 'none' ? null : parseInt(val));
    e.target.value = '';
  }

  return (
    <div className="cvlib-bulk-toolbar">
      <label className="cvlib-bulk-select-all">
        <input
          ref={checkboxRef}
          type="checkbox"
          className="cvlib-doc-checkbox"
          checked={allSelected}
          onChange={e => onSetDocsSelected(ids, e.target.checked)}
          aria-label="Select all CVs in this list"
        />
        {selectedDocIds.size > 0 ? `${selectedDocIds.size} selected` : 'Select all'}
      </label>

      <div className="cvlib-bulk-actions">
        <select
          className="cvlib-move-select"
          defaultValue=""
          onChange={handleMoveChange}
          disabled={selectedDocIds.size === 0}
          title="Move selected CVs to a different profile"
          aria-label="Move selected CVs to a different profile"
        >
          <option value="" disabled>Move to…</option>
          {moveTargets.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
          {currentProfileId != null && (
            <option value="none">Unorganised (remove from profile)</option>
          )}
        </select>
        <button
          className="btn btn-danger btn-sm btn-with-icon"
          onClick={onBulkDelete}
          disabled={selectedDocIds.size === 0}
        >
          <TrashIcon className="icon" /> Delete selected
        </button>
      </div>
    </div>
  );
}

// ── CvDocRow ──────────────────────────────────────────────────────────────────

function CvDocRow({ doc, isPrimary, showSetPrimary, onSetPrimary, onOpen, onClone, onMove, onEditDetails, onDelete, profiles,
                    selectMode, selected, onToggleSelect }) {
  const updatedDate = doc.updated_at
    ? new Date(doc.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  // Profiles available to move to: all except the one this CV currently belongs to.
  const moveTargets = (profiles || []).filter(p => p.id !== doc.profile_id);

  function handleMoveChange(e) {
    const val = e.target.value;
    if (!val) return;
    onMove(doc.id, val === 'none' ? null : parseInt(val));
    // Reset select back to placeholder so it can fire onChange again next time.
    e.target.value = '';
  }

  return (
    <li className={`cvlib-doc-row${isPrimary ? ' is-base' : ''}`}>
      <div className="cvlib-doc-info">
        {selectMode && (
          <input
            type="checkbox"
            className="cvlib-doc-checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${doc.title || 'Untitled CV'}`}
          />
        )}
        {isPrimary && <StarSolid className="cvlib-doc-star" aria-hidden="true" />}
        <span className="cvlib-doc-title" title={doc.title || 'Untitled CV'}>
          {doc.title || 'Untitled CV'}
        </span>
        {doc.notes && (
          <span title={doc.notes} aria-label="Has notes" className="cvlib-note-indicator">
            <ChatBubbleBottomCenterTextIcon className="cvlib-note-icon" />
          </span>
        )}
        {updatedDate && <span className="cvlib-doc-date">Updated {updatedDate}</span>}
      </div>
      {!selectMode && (
        <div className="cvlib-doc-actions">
          {showSetPrimary && (
            <button className="cvlib-icon-btn" onClick={onSetPrimary} title="Set as primary CV"
                    aria-label="Set as primary CV">
              <StarIcon className="cvlib-icon-btn-icon" />
            </button>
          )}

          {(moveTargets.length > 0 || doc.profile_id) && (
            <select
              className="cvlib-move-select"
              defaultValue=""
              onChange={handleMoveChange}
              title="Move to a different profile"
              aria-label="Move to a different profile"
            >
              <option value="" disabled>Move to…</option>
              {moveTargets.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
              {doc.profile_id && (
                <option value="none">Unorganised (remove from profile)</option>
              )}
            </select>
          )}

          <button className="cvlib-icon-btn" onClick={onEditDetails} title="Edit name and notes"
                  aria-label="Edit name and notes">
            <PencilIcon className="cvlib-icon-btn-icon" />
          </button>
          <button className="cvlib-icon-btn" onClick={onOpen} title="Open in Assembly"
                  aria-label="Open in Assembly">
            <ArrowTopRightOnSquareIcon className="cvlib-icon-btn-icon" />
          </button>
          <button className="cvlib-icon-btn" onClick={onClone} title="Create a copy"
                  aria-label="Create a copy">
            <DocumentDuplicateIcon className="cvlib-icon-btn-icon" />
          </button>
          <button className="cvlib-icon-btn cvlib-icon-btn-danger" onClick={onDelete}
                  title="Delete this CV" aria-label="Delete this CV">
            <TrashIcon className="cvlib-icon-btn-icon" />
          </button>
        </div>
      )}
    </li>
  );
}

// ── ProfileModal ──────────────────────────────────────────────────────────────

function ProfileModal({ profile, onSave, onClose }) {
  const [name, setName]        = useState(profile?.name ?? '');
  const [description, setDesc] = useState(profile?.description ?? '');
  const nameRef = useRef(null);
  const boxRef  = useRef(null);
  useFocusTrap(true, boxRef);

  useEffect(() => { nameRef.current?.focus(); }, []);

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim(), description.trim());
  }

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={e => e.key === 'Escape' && onClose()}>
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title"
           ref={boxRef} onClick={e => e.stopPropagation()}>
        <h2 className="modal-dialog-title" id="profile-modal-title">{profile ? 'Edit profile' : 'New profile'}</h2>
        <form onSubmit={handleSubmit} className="modal-form">
          <label className="modal-label">
            Name
            <input ref={nameRef} className="modal-input" value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Engineering Manager" required />
          </label>
          <label className="modal-label">
            Description <span className="modal-optional">(optional)</span>
            <input className="modal-input" value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="e.g. For senior IC and EM roles in engineering" />
          </label>
          <div className="modal-dialog-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim()}>
              {profile ? 'Save changes' : 'Create profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── EditCvDetailsModal ────────────────────────────────────────────────────────

function EditCvDetailsModal({ doc, onSave, onClose }) {
  const [name, setName]   = useState(doc.title || '');
  const [notes, setNotes] = useState(doc.notes || '');
  const nameRef = useRef(null);
  const boxRef  = useRef(null);
  useFocusTrap(true, boxRef);

  useEffect(() => { nameRef.current?.focus(); }, []);

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(doc.id, name.trim(), notes.trim());
  }

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={e => e.key === 'Escape' && onClose()}>
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-cv-modal-title"
           ref={boxRef} onClick={e => e.stopPropagation()}>
        <h2 className="modal-dialog-title" id="edit-cv-modal-title">Edit CV details</h2>
        <form onSubmit={handleSubmit} className="modal-form">
          <label className="modal-label">
            Name
            <input
              ref={nameRef}
              className="modal-input"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </label>
          <label className="modal-label">
            Note <span className="modal-optional">(optional — shown as a tooltip in the library)</span>
            <textarea
              className="modal-input"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Tailored for senior IC roles at scale-ups"
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </label>
          <div className="modal-dialog-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim()}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

