import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
}

export default function StartHiring() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: t('hiring.welcome', "Welcome! I'm your AI hiring assistant. Tell me about the role you're hiring for, and I'll help you find the perfect candidates.\n\nYou can describe your ideal candidate, paste a job description, or upload a JD file. What are you looking for?"),
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [jobDescription, setJobDescription] = useState('');
  const [step, setStep] = useState<'requirements' | 'review' | 'complete'>('requirements');
  const [hiringData, setHiringData] = useState({
    title: '',
    requirements: '',
    jobDescription: '',
    webhookUrl: '',
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Add assistant message helper
  const addAssistantMessage = (content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  // Add user message helper
  const addUserMessage = (content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userInput = input.trim();
    setInput('');
    addUserMessage(userInput);
    setIsProcessing(true);

    // Simulate AI processing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (step === 'requirements') {
      // Parse the requirements and extract key info
      setHiringData((prev) => ({
        ...prev,
        requirements: prev.requirements ? `${prev.requirements}\n${userInput}` : userInput,
      }));

      // Check if user provided enough information
      const hasEnoughInfo = userInput.length > 50 || hiringData.requirements.length > 50;

      if (hasEnoughInfo) {
        addAssistantMessage(
          t('hiring.gotIt', "Great! I've captured your requirements. Let me summarize what I understand:\n\n") +
            `**Position:** ${extractTitle(userInput, hiringData.requirements)}\n\n` +
            `**Key Requirements:**\n${summarizeRequirements(userInput, hiringData.requirements)}\n\n` +
            t('hiring.confirm', "Does this look correct? You can:\n- Type 'yes' to start hiring\n- Add more details\n- Upload a full JD for more context")
        );
        setHiringData((prev) => ({
          ...prev,
          title: extractTitle(userInput, prev.requirements),
        }));
        setStep('review');
      } else {
        addAssistantMessage(
          t('hiring.moreInfo', "That's a good start! Can you tell me more about:\n\n") +
            "- **Required skills** (must-haves vs nice-to-haves)\n" +
            "- **Experience level** (years, seniority)\n" +
            "- **Specific responsibilities**\n\n" +
            t('hiring.orUpload', "Or you can upload a job description file for more detailed matching.")
        );
      }
    } else if (step === 'review') {
      const lowerInput = userInput.toLowerCase();
      if (lowerInput === 'yes' || lowerInput === 'confirm' || lowerInput === 'start' || lowerInput === 'ok') {
        // User confirmed - create hiring request
        if (!isAuthenticated) {
          addAssistantMessage(
            t('hiring.loginRequired', "To create your hiring request and start receiving candidates, you'll need to sign in first.\n\n") +
              t('hiring.loginPrompt', "Click the button below to sign in or create an account. Your hiring requirements will be saved.")
          );
          setStep('complete');
        } else {
          await createHiringRequest();
        }
      } else {
        // User is adding more info
        setHiringData((prev) => ({
          ...prev,
          requirements: `${prev.requirements}\n${userInput}`,
        }));
        addAssistantMessage(
          t('hiring.updated', "Got it! I've updated your requirements. Ready to start hiring? Type 'yes' to proceed, or continue adding details.")
        );
      }
    }

    setIsProcessing(false);
  };

  const createHiringRequest = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        (headers as Record<string, string>).Authorization = `Bearer ${token}`;
      }
      const response = await fetch('/api/v1/hiring-requests', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          title: hiringData.title || 'New Hiring Request',
          requirements: hiringData.requirements,
          jobDescription: hiringData.jobDescription || jobDescription,
          webhookUrl: hiringData.webhookUrl,
        }),
      });

      const data = await response.json();

      if (data.success) {
        addAssistantMessage(
          t('hiring.success', "Your hiring request has been created! 🎉\n\n") +
            t('hiring.nextSteps', "**What happens next:**\n") +
            "1. Our AI will start screening incoming candidates\n" +
            "2. Matched candidates will be interviewed automatically\n" +
            "3. You'll receive evaluation reports for top matches\n\n" +
            t('hiring.dashboard', "Visit your dashboard to track progress and manage candidates.")
        );
        setStep('complete');
      } else {
        addAssistantMessage(
          t('hiring.error', "There was an issue creating your request: ") + data.error + "\n\n" +
            t('hiring.tryAgain', "Please try again or contact support if the issue persists.")
        );
      }
    } catch (error) {
      addAssistantMessage(
        t('hiring.error', "There was an issue creating your request. Please try again.")
      );
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    addUserMessage(`Uploaded: ${file.name}`);
    setIsProcessing(true);

    // Read file content
    const text = await file.text();
    setJobDescription(text);
    setHiringData((prev) => ({
      ...prev,
      jobDescription: text,
      requirements: prev.requirements ? `${prev.requirements}\n\nFrom JD:\n${text.substring(0, 500)}...` : text,
    }));

    await new Promise((resolve) => setTimeout(resolve, 1500));

    addAssistantMessage(
      t('hiring.jdParsed', "I've analyzed your job description. Here's what I found:\n\n") +
        `**Position:** ${extractTitle(text, '')}\n\n` +
        `**Key Requirements:**\n${summarizeRequirements(text, '')}\n\n` +
        t('hiring.jdConfirm', "Would you like to proceed with these requirements, or would you like to add any specific criteria?")
    );
    
    setHiringData((prev) => ({
      ...prev,
      title: extractTitle(text, ''),
    }));
    setStep('review');
    setIsProcessing(false);
  };

  // Helper functions
  const extractTitle = (text: string, existingReqs: string): string => {
    const combined = `${text} ${existingReqs}`.toLowerCase();
    
    // Common job titles
    const titles = [
      'Senior Software Engineer', 'Software Engineer', 'Frontend Developer',
      'Backend Developer', 'Full Stack Developer', 'Product Manager',
      'Data Scientist', 'DevOps Engineer', 'UI/UX Designer',
      'Engineering Manager', 'Technical Lead', 'QA Engineer',
    ];

    for (const title of titles) {
      if (combined.includes(title.toLowerCase())) {
        return title;
      }
    }

    // Try to extract from common patterns
    const patterns = [
      /looking for (?:a |an )?([^.]+)/i,
      /hiring (?:a |an )?([^.]+)/i,
      /need (?:a |an )?([^.]+)/i,
    ];

    for (const pattern of patterns) {
      const match = combined.match(pattern);
      if (match) {
        return match[1].trim().substring(0, 50);
      }
    }

    return 'New Position';
  };

  const summarizeRequirements = (text: string, existingReqs: string): string => {
    const combined = `${text} ${existingReqs}`;
    const lines = combined.split(/[.;\n]/).filter((line) => line.trim().length > 10);
    const requirements = lines.slice(0, 5).map((line) => `- ${line.trim()}`);
    return requirements.join('\n') || '- (Requirements will be extracted from your description)';
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-indigo-600">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>RoboHire</span>
          </Link>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="text-gray-600 hover:text-indigo-600 font-medium transition-colors"
              >
                {t('hiring.dashboard', 'Dashboard')}
              </Link>
            ) : (
              <Link
                to="/login"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
              >
                {t('hiring.signIn', 'Sign In')}
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-hidden">
        <div className="max-w-4xl mx-auto h-full flex flex-col px-4 py-6">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-6 pb-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-5 py-4 ${
                    message.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-800'
                  }`}
                >
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {message.content.split('\n').map((line, i) => {
                      // Handle bold text
                      const parts = line.split(/\*\*(.+?)\*\*/g);
                      return (
                        <p key={i} className={i > 0 ? 'mt-2' : ''}>
                          {parts.map((part, j) =>
                            j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                          )}
                        </p>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}

            {/* Processing indicator */}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                    <span className="text-gray-500 text-sm">{t('hiring.thinking', 'Thinking...')}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Login prompt for unauthenticated users */}
            {step === 'complete' && !isAuthenticated && (
              <div className="flex justify-center">
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 text-center max-w-md">
                  <h3 className="text-lg font-semibold text-indigo-900 mb-2">
                    {t('hiring.readyToStart', 'Ready to Start Hiring?')}
                  </h3>
                  <p className="text-indigo-700 text-sm mb-4">
                    {t('hiring.signInToSave', 'Sign in to save your hiring request and start receiving candidates.')}
                  </p>
                  <Link
                    to="/login"
                    state={{ from: { pathname: '/start-hiring' } }}
                    className="inline-block px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
                  >
                    {t('hiring.signInToContinue', 'Sign In to Continue')}
                  </Link>
                </div>
              </div>
            )}

            {/* Dashboard link after success */}
            {step === 'complete' && isAuthenticated && (
              <div className="flex justify-center">
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
                >
                  {t('hiring.goToDashboard', 'Go to Dashboard')}
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          {step !== 'complete' && (
            <div className="border-t border-gray-200 pt-4">
              <form onSubmit={handleSubmit} className="relative">
                <div className="flex items-end gap-3 bg-white rounded-2xl border border-gray-200 p-3 shadow-sm focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
                  {/* File Upload Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title={t('hiring.uploadJd', 'Upload Job Description')}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.pdf,.doc,.docx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  {/* Text Input */}
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                    placeholder={t('hiring.inputPlaceholder', 'Describe your ideal candidate...')}
                    className="flex-1 resize-none border-0 focus:ring-0 text-gray-800 placeholder-gray-400 max-h-32"
                    rows={1}
                    disabled={isProcessing}
                  />

                  {/* Send Button */}
                  <button
                    type="submit"
                    disabled={!input.trim() || isProcessing}
                    className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>

                {/* Helper Text */}
                <p className="text-xs text-gray-400 mt-2 text-center">
                  {t('hiring.helperText', 'Press Enter to send, Shift+Enter for new line. Upload a JD file for more detailed matching.')}
                </p>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
