import appKnowledge from '../../shared/appKnowledge.json';
import './HelpPage.css';

export default function HelpPage() {
  return (
    <div className="help-page">
      <div className="help-header">
        <h1>Help</h1>
      </div>

      <p className="help-intro">
        A quick guide to the main concepts in CV Ferret. If you enable AI features in Settings,
        the AI chat assistant in Assembly knows all of this too and can answer follow-up questions.
      </p>

      <div className="help-sections">
        {appKnowledge.map(section => (
          <section key={section.id} className="help-section">
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
