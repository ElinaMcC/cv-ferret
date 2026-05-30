import { useState, useEffect } from 'react';
import { personalAPI } from '../services/ipc';
import { useToast } from '../contexts/ToastContext';
import './PersonalDetails.css';

export default function PersonalDetails() {
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    gender: '',
    date_of_birth: '',
    place_of_birth: '',
    email: '',
    phone: '',
    links: [],
    address: '',
  });
  const [linkInput, setLinkInput] = useState('');
  const [error, setError] = useState('');
  const showToast = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await personalAPI.getPersonal();
      if (data && Object.keys(data).length > 0) {
        setForm(prev => ({ ...prev, ...data, links: data.links || [] }));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function addLink() {
    const link = linkInput.trim();
    if (!link || form.links.includes(link)) return;
    setForm(prev => ({ ...prev, links: [...prev.links, link] }));
    setLinkInput('');
  }

  function removeLink(link) {
    setForm(prev => ({ ...prev, links: prev.links.filter(l => l !== link) }));
  }

  async function handleSave() {
    try {
      await personalAPI.updatePersonal(form);
      showToast('Saved.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="personal-page">
      <h1>Personal Details</h1>
      {error && <div className="personal-error">{error}</div>}

      <div className="personal-form">
        <div className="personal-form-row">
          <div className="personal-form-group">
            <label>First Name</label>
            <input type="text" value={form.first_name} onChange={e => set('first_name', e.target.value)} />
          </div>
          <div className="personal-form-group">
            <label>Last Name</label>
            <input type="text" value={form.last_name} onChange={e => set('last_name', e.target.value)} />
          </div>
        </div>

        <div className="personal-form-row">
          <div className="personal-form-group">
            <label>Gender</label>
            <input type="text" value={form.gender} onChange={e => set('gender', e.target.value)} />
          </div>
          <div className="personal-form-group">
            <label>Date of Birth</label>
            <input type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
          </div>
          <div className="personal-form-group">
            <label>Place of Birth</label>
            <input type="text" value={form.place_of_birth} onChange={e => set('place_of_birth', e.target.value)} />
          </div>
        </div>

        <div className="personal-form-row">
          <div className="personal-form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div className="personal-form-group">
            <label>Phone</label>
            <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
        </div>

        <div className="personal-form-group">
          <label>Links</label>
          <div className="link-input-row">
            <input
              type="url"
              value={linkInput}
              onChange={e => setLinkInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
              placeholder="https://linkedin.com/in/yourname"
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={addLink}>Add</button>
          </div>
          {form.links.length > 0 && (
            <div className="links-list">
              {form.links.map(link => (
                <div key={link} className="link-item">
                  <a href={link} target="_blank" rel="noreferrer">{link}</a>
                  <button className="link-remove" onClick={() => removeLink(link)} title="Remove">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="personal-form-group">
          <label>Home Address</label>
          <textarea
            value={form.address}
            onChange={e => set('address', e.target.value)}
            rows="3"
            placeholder="Street, City, Postcode, Country"
          />
        </div>

        <div className="personal-actions">
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
