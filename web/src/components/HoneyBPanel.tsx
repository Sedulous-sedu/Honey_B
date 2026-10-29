import React, { useState, useEffect } from 'react';
import { useAtcStore } from '../store/useAtcStore';
import { Suggestion } from '../types';
import { Send, AlertTriangle, ShieldCheck, Zap, MessageSquare, Lock, ShieldAlert } from 'lucide-react';
import { EmergencyAdvisorModal } from './EmergencyAdvisorModal';

export const HoneyBPanel: React.FC = () => {
  const suggestions = useAtcStore((s) => s.suggestions);
  const sendCommand = useAtcStore((s) => s.sendCommand);
  const activeControllerId = useAtcStore((s) => s.activeControllerId);
  const controllers = useAtcStore((s) => s.controllers);
  const weather = useAtcStore((s) => s.weather);
  const selectedAircraftId = useAtcStore((s) => s.selectedAircraftId);
  const approvedSequenceAdvisory = useAtcStore((s) => s.approvedSequenceAdvisory);
  const setSelectedId = useAtcStore((s) => s.setSelectedAircraftId);

  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [advisorModalOpen, setAdvisorModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'CRITICAL' | 'MINE'>(
    activeControllerId === 'ALL' ? 'ALL' : 'MINE'
  );

  // Sync filter when active controller changes
  useEffect(() => {
    setActiveFilter(activeControllerId === 'ALL' ? 'ALL' : 'MINE');
  }, [activeControllerId]);

  const activeCtrl = controllers.find((c) => c.id === activeControllerId);

  // Filter suggestions
  const filteredSuggestions = suggestions.filter((s) => {
    if (s.status === 'EXECUTED') return false;
    if (activeFilter === 'CRITICAL' && s.urgency !== 'CRITICAL') return false;
    if (activeFilter === 'MINE' && activeControllerId !== 'ALL' && s.targetControllerId !== activeControllerId) return false;
    return true;
  });

  const handleSend = async (sug: Suggestion) => {
    await sendCommand(sug.aircraftId, sug);
  };

  const handleAskAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuestion.trim()) return;

    setAiLoading(true);
    setAiAnswer(null);
    try {
      const res = await fetch(`http://${window.location.hostname || 'localhost'}:8000/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiQuestion })
      });
      const data = await res.json();
      setAiAnswer(data.reply);
    } catch {
      setAiAnswer('Unable to connect to Honey B AI advisory engine.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="w-96 h-full bg-[#0E1524] border-l border-[#162338] flex flex-col select-none overflow-hidden shadow-2xl">
      {/* Brand Header matching photo */}
      <div className="p-4 bg-gradient-to-r from-[#111C30] via-[#162540] to-[#1C1E38] border-b border-[#20314F]">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-2xl">
            🐝
          </div>
          <div>
            <h1 className="text-xl font-bold font-sans tracking-tight text-white flex items-center space-x-2">
              <span>Honey B</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                DECISION SUPPORT
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-mono">
              {activeControllerId === 'ALL'
                ? 'Supervisor Operations Overview'
                : `Sector Console: ${activeCtrl?.name || activeControllerId}`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Section 1: Filtered & Prioritized Data (Matching Photo) */}
        <div className="bg-[#121B2D] rounded-xl p-3 border border-[#1E2E4A] shadow-inner">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
                Filtered & Prioritized Data
              </h2>
            </div>
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60">
              {weather?.lvp.active ? 'LVP RULES ACTIVE' : 'NOMINAL SEPARATION'}
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-400">
            <div className="flex items-center space-x-2 text-[11px] text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Key traffic, conflicts and constraints ranked</span>
            </div>
            <div className="flex items-center space-x-2 text-[11px] text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Reduced clutter — only actionable events surfaced</span>
            </div>
          </div>

          {/* Situation Summary Alert */}
          {weather?.lvp.active && (
            <div className="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Low Visibility Procedures:</span> Dense fog (RVR 400m). GCAA OMDB LVO spacing active. CAT I aircraft must divert.
              </div>
            </div>
          )}
        </div>

        {/* Section 1B: Emergency Sequence Change Risk Advisor Launcher */}
        <div className="bg-gradient-to-br from-[#161F36] to-[#121A2D] rounded-xl p-3 border border-amber-500/40 shadow-md">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-md bg-amber-500/20 text-amber-300 flex items-center justify-center">
                <ShieldAlert className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-xs font-mono font-bold tracking-wider text-amber-200 uppercase">
                Emergency Sequence Risk Advisor
              </h2>
            </div>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              OMDB KC v1.0
            </span>
          </div>
          <p className="text-[11px] text-slate-300 leading-snug mb-2">
            Compare baseline vs candidate arrival resequencing, displaced flight fuel margins, wake/LVO spacing, and deterministic stress scenarios.
          </p>

          {approvedSequenceAdvisory && (
            <div className="mb-2 p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-[10px] font-mono text-emerald-200">
              <div className="font-bold text-emerald-300">
                ACTIVE APPROVED ESTIMATE ({approvedSequenceAdvisory.emergencyAircraftId})
              </div>
              <div>{approvedSequenceAdvisory.candidateLabel}</div>
              <div className="text-emerald-400/80">
                Source: {approvedSequenceAdvisory.source} @ {approvedSequenceAdvisory.approvedAtUtc.slice(11, 19)}Z
              </div>
            </div>
          )}

          <button
            onClick={() => setAdvisorModalOpen(true)}
            className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-mono font-bold flex items-center justify-center space-x-1.5 shadow-md transition-colors"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Evaluate Emergency Resequencing</span>
          </button>
        </div>

        {/* Section 2: Suggested Commands (Matching Photo) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-md bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <Send className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
                Suggested Commands ({filteredSuggestions.length})
              </h2>
            </div>

            {/* Filter buttons */}
            <div className="flex space-x-1 text-[10px] font-mono">
              <button
                onClick={() => setActiveFilter('ALL')}
                className={`px-1.5 py-0.5 rounded ${activeFilter === 'ALL' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400'}`}
              >
                ALL
              </button>
              {activeControllerId !== 'ALL' && (
                <button
                  onClick={() => setActiveFilter('MINE')}
                  className={`px-1.5 py-0.5 rounded ${activeFilter === 'MINE' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400'}`}
                >
                  MINE
                </button>
              )}
              <button
                onClick={() => setActiveFilter('CRITICAL')}
                className={`px-1.5 py-0.5 rounded ${activeFilter === 'CRITICAL' ? 'bg-rose-600 text-white font-bold' : 'text-slate-400'}`}
              >
                URGENT
              </button>
            </div>
          </div>

          {/* List of Suggestions */}
          <div className="space-y-2">
            {filteredSuggestions.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#121B2D] border border-[#1E2E4A] text-center text-xs text-slate-400 font-mono">
                No active conflicts in this sector.
              </div>
            ) : (
              (showAllSuggestions ? filteredSuggestions : filteredSuggestions.slice(0, 3)).map((sug) => {
                const isCritical = sug.urgency === 'CRITICAL';
                const isMyFlight = activeControllerId === 'ALL' || sug.targetControllerId === activeControllerId;
                const assignedCtrl = controllers.find((c) => c.id === sug.targetControllerId);
                const assignedCtrlName = assignedCtrl ? assignedCtrl.name : (sug.targetControllerId || 'ATC');

                return (
                  <div
                    key={sug.suggestionId}
                    className={`p-3 rounded-xl border transition-all ${
                      isCritical
                        ? 'bg-rose-950/20 border-rose-500/50 hover:border-rose-400'
                        : isMyFlight
                        ? 'bg-[#121B2D] border-cyan-500/30 hover:border-cyan-400/60'
                        : 'bg-[#0F1726]/60 border-[#1B2940] opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div
                        className="cursor-pointer flex-1 mr-2"
                        onClick={() => setSelectedId(sug.aircraftId)}
                      >
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-xs text-white">
                            {sug.aircraftId}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded font-mono ${
                              isCritical
                                ? 'bg-rose-500/30 text-rose-300'
                                : 'bg-purple-500/30 text-purple-300'
                            }`}
                          >
                            {sug.instructionType}
                          </span>
                          {/* Controller Ownership Badge */}
                          <span className="text-[9px] font-mono text-slate-400">
                            {isMyFlight && activeControllerId !== 'ALL'
                              ? '● YOUR SECTOR'
                              : `[${assignedCtrlName}]`}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-200 mt-1">
                          {sug.displayText}
                        </p>
                      </div>

                      {/* Send Clearance Button or Handled Badge */}
                      {isMyFlight ? (
                        <button
                          onClick={() => handleSend(sug)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center space-x-1.5 transition-all shadow-md shrink-0 ${
                            isCritical
                              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                              : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30'
                          }`}
                          title="Issue clearance to aircraft"
                        >
                          <span>Send</span>
                          <Send className="w-3 h-3" />
                        </button>
                      ) : (
                        <div className="flex items-center space-x-1 px-2 py-1 rounded bg-[#10192A] border border-[#1F2E47] text-[10px] font-mono text-slate-400 shrink-0">
                          <Lock className="w-3 h-3 text-slate-500" />
                          <span>Handled by {assignedCtrlName}</span>
                        </div>
                      )}
                    </div>

                    {/* Rationale */}
                    <p className="text-[11px] text-slate-400 mt-2 font-sans leading-relaxed border-t border-[#1C2C47] pt-1.5">
                      {sug.reasonText}
                    </p>
                  </div>
                );
              })
            )}

            {filteredSuggestions.length > 3 && (
              <button
                onClick={() => setShowAllSuggestions((v) => !v)}
                className="w-full py-1.5 text-center rounded-lg bg-[#111A2C] hover:bg-[#16233B] border border-[#1E2E4A] text-xs font-mono text-cyan-300 font-bold transition-colors"
              >
                {showAllSuggestions
                  ? '▲ Show Top 3 Critical Only'
                  : `▼ View All ${filteredSuggestions.length} Suggestions`}
              </button>
            )}
          </div>
        </div>

        {/* Section 3: Natural Language ATC Explanation / AI Assistant */}
        <div className="bg-[#121B2D] rounded-xl p-3 border border-[#1E2E4A]">
          <div className="flex items-center space-x-2 mb-2">
            <MessageSquare className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-mono font-bold text-slate-200 uppercase">
              Explain Rationale / Chat
            </h3>
          </div>

          <form onSubmit={handleAskAi} className="flex space-x-1.5">
            <input
              type="text"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              placeholder="e.g. Why is FDB512 prioritized?"
              className="flex-1 bg-[#090F1C] border border-[#1E2E4A] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-sans"
            />
            <button
              type="submit"
              disabled={aiLoading}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
            >
              {aiLoading ? '...' : 'Ask'}
            </button>
          </form>

          {/* Quick preset questions */}
          <div className="flex flex-wrap gap-1 mt-2">
            {['Who is most at risk?', 'Why is FDB512 ranked first?', 'What if I divert FDB512?'].map((q) => (
              <button
                key={q}
                onClick={() => setAiQuestion(q)}
                className="text-[10px] font-mono text-cyan-300/80 bg-cyan-950/40 hover:bg-cyan-900/60 px-1.5 py-0.5 rounded border border-cyan-800/40"
              >
                {q}
              </button>
            ))}
          </div>

          {aiAnswer && (
            <div className="mt-2.5 p-2 rounded-lg bg-[#090F1C] border border-cyan-500/30 text-xs text-cyan-100 font-sans leading-relaxed">
              <span className="font-mono text-[10px] font-bold text-cyan-400 block mb-1">
                HONEY B ADVISORY RATIONALE:
              </span>
              {aiAnswer}
            </div>
          )}
        </div>
      </div>

      <EmergencyAdvisorModal
        isOpen={advisorModalOpen}
        onClose={() => setAdvisorModalOpen(false)}
        initialAircraftId={selectedAircraftId}
      />
    </div>
  );
};
