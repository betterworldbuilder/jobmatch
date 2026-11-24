import { ArrowRight, BarChart3, Check, CreditCard, Heart, MapPin, Sparkles, Users } from 'lucide-react';
import { PhoneMockup } from '../PhoneMockup';
import { TourButtons } from '../AuthModals';

const FIVE_STEPS_TEMPLATE = '/5stepstemplate.png';

function Brand() { return <div className="brand"><span className="brand-heart-mark" aria-hidden="true" /><span className="brand-wordmark"><b>Jobs</b><b>Match</b><b>Now</b></span></div>; }

type HeroProps = { onRegister: () => void; onLogin: () => void };

/* Phone landing (founder, 2026-11-23): mockup first, then the buttons on 2 rows, then this one-line consent,
   then the title. The phone-only parts are hidden on desktop by CSS (.landing-phone), so desktop is unchanged. */
function HeroActions({ onRegister, onLogin }: HeroProps) {
  return <>
    {/* Full tours (founder, 2026-11-24): right above Register free. Shown while the `tour` flag is on. */}
    <TourButtons className="hero-tours" />
    <div className="hero-actions"><button className="primary-button" onClick={onRegister}>Register free <ArrowRight size={18} /></button><button className="secondary-button" onClick={onLogin}>Log in</button><button className="secondary-button demo-test-button" onClick={onLogin}><Sparkles size={18} /> <span className="demo-label-long">Test demo account</span><span className="demo-label-short">Try demo</span></button></div></>;
}
function HeroConsent() {
  return <p className="hero-consent">By continuing you agree to our <a href="/terms.html">Terms</a>, <a href="/privacy.html">Privacy</a> &amp; <a href="/privacy.html#cookies">Cookies</a>.</p>;
}

/** Default hero banner — the original landing page. */
export function HeroDefault({ onRegister, onLogin }: HeroProps) {
  return <section className="hero">
    <div className="hero-copy">
      <div className="eyebrow"><Sparkles size={14} /> Find jobs you’ll love — and the people who’ll love the role and your company.</div>
      <h1>Stop chasing jobs and candidates.<br /><span>Let the perfect match chase you.</span></h1>
      <p className="hero-long">Job seekers, let the perfect role find you. Hiring teams, let the right candidates come to you. A connection opens only when both sides choose. Your next dream job — or dream candidate — might be just a few clicks away.</p>
      <p className="hero-short">The right role or candidate finds you, and a chat opens only when both sides choose.</p>
      <div className="location-pitch-app"><MapPin size={18} /><span><small>Geolocation of Opportunities</small><strong>Match nearby. Meet for a cup of coffee in your city.</strong></span></div>
      <HeroActions onRegister={onRegister} onLogin={onLogin} />
      <div className="proof-row"><span><Check size={14} /> Explainable fit</span><span><Check size={14} /> Private distance range</span><span><Check size={14} /> Salary up front</span></div>
      <HeroConsent />
    </div>
    <div className="hero-visual carousel-side" aria-label="JobsMatchNow product preview">
      <div className="floating-love love-one"><Heart size={16} fill="currentColor" /></div><div className="floating-love love-two"><Sparkles size={14} /></div>
      <PhoneMockup />
    </div>
  </section>;
}

/** Custom-image hero banner with the complete five-step journey and product
 * screenshots composed as one responsive marketing template.
 *
 * `url` is the admin-uploaded banner (Action Queue → Landing page banner →
 * Replace image). When one has been uploaded it is what renders; the bundled
 * template is only the fallback for a fresh install that has never had an
 * upload. Without this the upload silently had no effect on the live page. */
export function HeroImage({ url, onRegister, onLogin }: HeroProps & { url?: string }) {
  return <section className="hero hero-image">
    <img className="hero-image-art hero-image-art-top" src={url || FIVE_STEPS_TEMPLATE} alt="JobsMatchNow five-step recruiting journey" />
    <HeroActions onRegister={onRegister} onLogin={onLogin} />
    <HeroConsent />
  </section>;
}

/** Alternate hero banner — pink feature-card layout, admin-selectable via
 * the "Landing page banner" control in the Action Queue tab. */
export function HeroAlt({ onRegister, onLogin }: HeroProps) {
  const features = [
    { icon: Users, title: 'Mutual Matching', text: 'Connect when both sides are interested.' },
    { icon: BarChart3, title: 'Explainable Fit', text: 'See why a job or candidate is a great match.' },
    { icon: CreditCard, title: 'Salary Up Front', text: 'Transparent information, no surprises.' },
  ];
  return <section className="hero hero-alt">
    <div className="hero-copy">
      <Brand />
      <div className="eyebrow hero-alt-eyebrow"><Sparkles size={14} /> Find jobs you’ll love — and the people who’ll love the role and your company.</div>
      <div className="hero-alt-features">{features.map((f) => <div className="hero-alt-feature" key={f.title}><f.icon size={20} /><div><strong>{f.title}</strong><span>{f.text}</span></div></div>)}</div>
      <HeroActions onRegister={onRegister} onLogin={onLogin} />
      <div className="proof-row"><span><Check size={14} /> Explainable fit</span><span><Check size={14} /> Private distance range</span><span><Check size={14} /> Salary up front</span></div>
      <HeroConsent />
    </div>
    <div className="hero-visual carousel-side" aria-label="JobsMatchNow product preview">
      <div className="floating-love love-one"><Heart size={16} fill="currentColor" /></div><div className="floating-love love-two"><Sparkles size={14} /></div>
      <PhoneMockup />
    </div>
  </section>;
}
