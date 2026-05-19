/**
 * Privacy Policy Page
 *
 * Static page displaying the privacy policy for Eval.
 */

import React from 'react';
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy - Eval',
  description: 'Privacy Policy for Eval educational coding platform',
};

const CONTACT_EMAIL = 'joe@delquillan.com';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-2xl border border-gray-100 p-8 md:p-12">
        {/* Header */}
        <div className="text-center mb-8">
          <Link
            href="/"
            className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg mb-4"
          >
            <svg
              className="w-7 h-7 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
          </Link>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-gray-500">Last updated: May 2026</p>
        </div>

        {/* Content */}
        <div className="prose prose-indigo max-w-none">
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
            <p className="text-gray-600 mb-4">
              Eval (&quot;we,&quot; &quot;our,&quot; or &quot;the Service&quot;) is an
              educational coding platform. This Privacy Policy explains what we collect, how we
              use it, and what we don&apos;t do with it. We&apos;ve kept this short and specific
              on purpose.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">2. What We Don&apos;t Do</h2>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>We don&apos;t show ads or build advertising profiles.</li>
              <li>We don&apos;t use third-party analytics, trackers, or behavioral profiling.</li>
              <li>We don&apos;t sell, rent, or trade your data.</li>
              <li>
                We don&apos;t share your data with anyone outside the small list of infrastructure
                providers in section 5.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">3. Information We Collect</h2>

            <h3 className="text-lg font-medium text-gray-800 mb-3">Account Information</h3>
            <p className="text-gray-600 mb-4">When you create an account, we collect:</p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>Email address</li>
              <li>Username/display name</li>
              <li>Role within the platform (student, instructor, administrator)</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mb-3">Educational Data</h3>
            <p className="text-gray-600 mb-4">As you use the Service, we store:</p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>Code submissions and revisions</li>
              <li>Code execution results and outputs</li>
              <li>Session participation data</li>
              <li>Class and section enrollment information</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mb-3">Server Logs</h3>
            <p className="text-gray-600 mb-4">
              Like any web service, we keep server-side request logs (IP address, timestamp,
              request path, browser type). We use these for security, debugging, and abuse
              investigation — nothing else.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">4. How We Use Your Information</h2>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>Run the platform and keep you signed in</li>
              <li>Enable real-time code sharing during classroom sessions</li>
              <li>Let instructors view student code and progress in their sections</li>
              <li>Execute and grade code submissions</li>
              <li>Investigate abuse and keep the platform secure</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">5. How We Share Information</h2>

            <h3 className="text-lg font-medium text-gray-800 mb-3">Within Your Class</h3>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>
                Instructors see student code, submissions, and progress within their sections.
              </li>
              <li>
                Administrators see data within their organization/namespace.
              </li>
              <li>
                Code may be displayed in real-time during classroom sessions.
              </li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mb-3">Infrastructure Providers</h3>
            <p className="text-gray-600 mb-4">
              The Service runs on infrastructure operated by Google. Specifically:
            </p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>
                <strong>Google Cloud Platform</strong> — hosting, compute (GKE), database (Cloud
                SQL Postgres), and build (Cloud Build). Your data is stored in Google&apos;s data
                centers.
              </li>
              <li>
                <strong>Firebase Authentication / Google Identity Platform</strong> — sign-in. We
                share your email address with this service when you authenticate.
              </li>
            </ul>
            <p className="text-gray-600 mb-4">
              The real-time collaboration server (Centrifugo) runs on our own infrastructure
              inside Google Cloud — your live code-sharing traffic does not leave the Google
              Cloud perimeter or go through any third party.
            </p>
            <p className="text-gray-600 mb-4">
              That&apos;s the full list. We don&apos;t use any third-party analytics, advertising,
              error-monitoring, or email-marketing services.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mb-3">Legal Requirements</h3>
            <p className="text-gray-600 mb-4">
              We may disclose information if required by law or in response to a valid legal
              request from a public authority.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Data Security</h2>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>All traffic is encrypted in transit (HTTPS).</li>
              <li>
                Access controls limit data to your instructors and administrators within your
                section or organization.
              </li>
              <li>
                Database-level row security enforces those access rules at the storage layer, not
                just in application code.
              </li>
            </ul>
            <p className="text-gray-600 mb-4">
              No system is perfectly secure, but we&apos;ve tried to keep the attack surface small
              and the data access rules explicit.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Data Retention</h2>
            <p className="text-gray-600 mb-4">
              We keep your account and educational data until you ask us to delete it. To delete
              your account and associated data, email{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-indigo-600 hover:text-indigo-500"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">8. Your Rights</h2>
            <p className="text-gray-600 mb-4">You can ask us to:</p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>Show you the personal data we have about you</li>
              <li>Correct anything that&apos;s wrong</li>
              <li>Delete your data</li>
              <li>Export your data</li>
              <li>Stop processing your data</li>
            </ul>
            <p className="text-gray-600 mb-4">
              To exercise any of these rights, email{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-indigo-600 hover:text-indigo-500"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">9. Children&apos;s Privacy</h2>
            <p className="text-gray-600 mb-4">
              Eval is designed for educational use. We do not knowingly collect personal
              information from children under 13 without parental consent.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">10. Cookies</h2>
            <p className="text-gray-600 mb-4">
              We use one session cookie to keep you signed in. That&apos;s it. We don&apos;t use
              tracking, analytics, or advertising cookies.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">11. Changes to This Policy</h2>
            <p className="text-gray-600 mb-4">
              If we change this policy, we&apos;ll update the &quot;Last updated&quot; date at the
              top of this page.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">12. Contact Us</h2>
            <p className="text-gray-600 mb-4">
              Questions about this Privacy Policy? Email{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-indigo-600 hover:text-indigo-500"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-8 border-t border-gray-200 text-center">
          <div className="flex justify-center gap-6 text-sm">
            <Link
              href="/"
              className="text-indigo-600 hover:text-indigo-500 transition-colors"
            >
              Back to Home
            </Link>
            <Link
              href="/terms"
              className="text-indigo-600 hover:text-indigo-500 transition-colors"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
