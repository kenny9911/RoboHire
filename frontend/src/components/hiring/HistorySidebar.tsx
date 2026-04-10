import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

interface ChatSession {
  id: string;
  title: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface HiringRequest {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

interface HistorySidebarProps {
  sessions: ChatSession[];
  hiringRequests: HiringRequest[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isLoading?: boolean;
}

export default function HistorySidebar({
  sessions,
  hiringRequests,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  isCollapsed,
  onToggleCollapse,
  isLoading = false,
}: HistorySidebarProps) {
  const { t } = useTranslation();
  const [expandedSection, setExpandedSection] = useState<'sessions' | 'requests' | null>('sessions');

  // Group sessions by date
  const groupSessionsByDate = (items: ChatSession[]) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups: { label: string; items: ChatSession[] }[] = [
      { label: t('hiring.today', 'Today'), items: [] },
      { label: t('hiring.yesterday', 'Yesterday'), items: [] },
      { label: t('hiring.lastWeek', 'Last 7 days'), items: [] },
      { label: t('hiring.older', 'Older'), items: [] },
    ];

    items.forEach((item) => {
      const date = new Date(item.updatedAt);
      if (date.toDateString() === today.toDateString()) {
        groups[0].items.push(item);
      } else if (date.toDateString() === yesterday.toDateString()) {
        groups[1].items.push(item);
      } else if (date > lastWeek) {
        groups[2].items.push(item);
      } else {
        groups[3].items.push(item);
      }
    });

    return groups.filter((g) => g.items.length > 0);
  };

  const sessionGroups = groupSessionsByDate(sessions);

  // Collapsed view
  if (isCollapsed) {
    return (
      <div className="w-16 bg-gray-50 border-r border-gray-200 flex flex-col items-center py-4 gap-4">
        <button
          onClick={onToggleCollapse}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          title={t('hiring.expandSidebar', 'Expand sidebar')}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        <button
          onClick={onNewChat}
          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          title={t('hiring.newChat', 'New Chat')}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        <div className="flex-1" />

        <Link
          to="/product"
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          title={t('hiring.backToDashboard', 'Back to Dashboard')}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        </Link>
      </div>
    );
  }

  // Expanded view
  return (
    <div className="w-72 bg-gray-50 border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{t('hiring.history', 'History')}</h2>
          <button
            onClick={onToggleCollapse}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title={t('hiring.collapseSidebar', 'Collapse sidebar')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </svg>
          </button>
        </div>

        {/* New Chat Button */}
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('hiring.newChat', 'New Chat')}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-10 bg-gray-200 rounded-lg" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Chat Sessions */}
            <div className="p-3">
              <button
                onClick={() =>
                  setExpandedSection(expandedSection === 'sessions' ? null : 'sessions')
                }
                className="w-full flex items-center justify-between p-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                  {t('hiring.chatSessions', 'Chat Sessions')}
                </span>
                <svg
                  className={`w-4 h-4 transition-transform ${expandedSection === 'sessions' ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {expandedSection === 'sessions' && (
                <div className="mt-2 space-y-4">
                  {sessionGroups.length > 0 ? (
                    sessionGroups.map((group) => (
                      <div key={group.label}>
                        <p className="px-2 py-1 text-xs font-medium text-gray-400 uppercase tracking-wider">
                          {group.label}
                        </p>
                        <div className="space-y-1">
                          {group.items.map((session) => (
                            <SessionItem
                              key={session.id}
                              session={session}
                              isActive={session.id === activeSessionId}
                              onClick={() => onSelectSession(session.id)}
                              onDelete={() => onDeleteSession(session.id)}
                            />
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="px-2 py-4 text-sm text-gray-400 text-center">
                      {t('hiring.noSessions', 'No chat sessions yet')}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Past Requisitions */}
            <div className="p-3 border-t border-gray-200">
              <button
                onClick={() =>
                  setExpandedSection(expandedSection === 'requests' ? null : 'requests')
                }
                className="w-full flex items-center justify-between p-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                  {t('hiring.pastRequisitions', 'Past Requisitions')}
                </span>
                <svg
                  className={`w-4 h-4 transition-transform ${expandedSection === 'requests' ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {expandedSection === 'requests' && (
                <div className="mt-2 space-y-1">
                  {hiringRequests.length > 0 ? (
                    hiringRequests.slice(0, 10).map((request) => (
                      <Link
                        key={request.id}
                        to={`/product/hiring/${request.id}`}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            request.status === 'active'
                              ? 'bg-green-500'
                              : request.status === 'paused'
                                ? 'bg-yellow-500'
                                : 'bg-gray-400'
                          }`}
                        />
                        <span className="truncate flex-1">{request.title}</span>
                      </Link>
                    ))
                  ) : (
                    <p className="px-2 py-4 text-sm text-gray-400 text-center">
                      {t('hiring.noRequisitions', 'No hiring requests yet')}
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200">
        <Link
          to="/product"
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
          {t('hiring.backToDashboard', 'Back to Dashboard')}
        </Link>
      </div>
    </div>
  );
}

// Session Item Component
function SessionItem({
  session,
  isActive,
  onClick,
  onDelete,
}: {
  session: ChatSession;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [showDelete, setShowDelete] = useState(false);
  const { t } = useTranslation();

  return (
    <div
      className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'
      }`}
      onClick={onClick}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      <svg
        className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-indigo-500' : 'text-gray-400'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
        />
      </svg>
      <span className="truncate flex-1 text-sm">
        {session.title || t('hiring.untitledChat', 'Untitled Chat')}
      </span>

      {showDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute right-2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          title={t('hiring.deleteSession', 'Delete session')}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
