// "Recruitment process" (sidebar, above Code of Conduct): the sequence of actions when someone gets hired
// or a process stops. These rules are enforced by the server (server/hiring-rules.js), not just described.
import { motion } from 'framer-motion';
import { Ban, BadgeCheck, Briefcase, X } from 'lucide-react';
import { STOP_REASONS } from './home/HiringStages';

export function RecruitmentRulesModal({ onClose }: { onClose: () => void }) {
  return <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
    <motion.div className="coach-modal conduct-modal rules-modal" initial={{ y: 26, scale: .97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 18, scale: .97 }} onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" onClick={onClose} aria-label="Close"><X /></button>
      <header className="coach-head"><div><span className="overline">How we work</span><h2>Recruitment process</h2></div></header>
      <div className="coach-body conduct-body">
        <p>Nobody should be left waiting. When a hiring process ends, everyone involved hears about it, right away and politely. JobsMatchNow does these steps for you.</p>

        <h4><BadgeCheck size={16} /> 1. A candidate gets hired</h4>
        <ol>
          <li>The candidate sets their status to <b>I just got hired!</b> and picks the role.</li>
          <li>Their other open hiring processes close and the upcoming meetings are cancelled (calendars update too).</li>
          <li>Each of those recruiters gets an <b>automatic thank-you message</b> from the candidate for their time.</li>
          <li>The candidate leaves recruiter search. Teams they already matched keep the conversation. Choosing <b>Open to work</b> brings them back.</li>
        </ol>

        <h4><Briefcase size={16} /> 2. A recruiter hires someone</h4>
        <ol>
          <li>The recruiter marks the candidate <b>Hired</b> on <b>Hiring Stages</b>.</li>
          <li>The role is marked filled and leaves candidates' search.</li>
          <li>Every other candidate in that role's process gets an <b>automatic thank-you</b> saying the role is filled, and their upcoming meetings are cancelled.</li>
          <li>The message offers to <b>recommend their profile to another recruiter</b>. If the candidate says yes, the recruiter uses <b>Recommend</b> in the conversation.</li>
        </ol>

        <h4><Ban size={16} /> 3. A recruiter stops a process</h4>
        <ol>
          <li>The recruiter must pick the <b>main reason</b> and write <b>honest, specific feedback</b> (at least 30 characters). The process cannot be stopped without it.</li>
          <li>The candidate receives the reason and feedback in the conversation, and upcoming meetings are cancelled.</li>
          <li>Reasons: {STOP_REASONS.join(' · ')}.</li>
        </ol>
        <p className="cb-note">Feedback must follow the Code of Conduct: job-related, respectful, never about age, gender, race, religion, disability or other protected characteristics.</p>
      </div>
    </motion.div>
  </motion.div>;
}
