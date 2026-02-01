/**
 * Privacy Policy Page
 *
 * Static page displaying the privacy policy for Code Classroom.
 */

import React from 'react';
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy - Code Classroom',
  description: 'Privacy Policy for Code Classroom educational coding platform',
};

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
          <p className="mt-2 text-sm text-gray-500">Last updated: January 2026</p>
        </div>

        {/* Content */}
        <div className="prose prose-indigo max-w-none">
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
            <p className="text-gray-600 mb-4">
              Code Classroom (&quot;we,&quot; &quot;our,&quot; or &quot;the Service&quot;) is committed to protecting
              your privacy. This Privacy Policy explains how we collect, use, disclose, and
              safeguard your information when you use our educational coding platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">2. Information We Collect</h2>

            <h3 className="text-lg font-medium text-gray-800 mb-3">Account Information</h3>
            <p className="text-gray-600 mb-4">When you create an account, we collect:</p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>Email address</li>
              <li>Username/display name</li>
              <li>Password (stored securely using industry-standard hashing)</li>
              <li>Role within the platform (student, instructor, administrator)</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mb-3">Educational Data</h3>
            <p className="text-gray-600 mb-4">In the course of using the Service, we collect:</p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>Code submissions and revisions</li>
              <li>Code execution results and outputs</li>
              <li>Session participation data</li>
              <li>Class and section enrollment information</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mb-3">Usage Data</h3>
            <p className="text-gray-600 mb-4">We automatically collect:</p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>Browser type and version</li>
              <li>Access times and dates</li>
              <li>Pages viewed and features used</li>
              <li>IP address (for security purposes)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">3. How We Use Your Information</h2>
            <p className="text-gray-600 mb-4">We use the collected information to:</p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>Provide and maintain the Service</li>
              <li>Enable real-time code sharing and collaboration</li>
              <li>Allow instructors to monitor student progress</li>
              <li>Execute and process code submissions</li>
              <li>Communicate with you about the Service</li>
              <li>Ensure the security and integrity of the platform</li>
              <li>Improve and optimize the Service</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">4. Information Sharing</h2>
            <p className="text-gray-600 mb-4">
              We share your information in the following circumstances:
            </p>

            <h3 className="text-lg font-medium text-gray-800 mb-3">Within Educational Context</h3>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>
                Instructors can view student code, submissions, and progress within their sections
              </li>
              <li>
                Administrators can access data within their organization/namespace
              </li>
              <li>
                Code may be displayed in real-time during classroom sessions
              </li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mb-3">Service Providers</h3>
            <p className="text-gray-600 mb-4">
              We may share information with third-party service providers who assist in operating
              the Service (e.g., hosting providers, authentication services). These providers are
              bound by confidentiality obligations.
            </p>

            <h3 className="text-lg font-medium text-gray-800 mb-3">Legal Requirements</h3>
            <p className="text-gray-600 mb-4">
              We may disclose information if required by law or in response to valid legal
              requests from public authorities.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">5. Data Security</h2>
            <p className="text-gray-600 mb-4">
              We implement appropriate technical and organizational measures to protect your
              information, including:
            </p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>Encryption of data in transit (HTTPS)</li>
              <li>Secure password hashing</li>
              <li>Role-based access controls</li>
              <li>Regular security assessments</li>
            </ul>
            <p className="text-gray-600 mb-4">
              However, no method of transmission over the Internet is 100% secure, and we cannot
              guarantee absolute security.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Data Retention</h2>
            <p className="text-gray-600 mb-4">
              We retain your information for as long as your account is active or as needed to
              provide the Service. Educational data may be retained for the duration of the
              academic term or as required by your institution. You may request deletion of your
              account and associated data by contacting your administrator.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Your Rights</h2>
            <p className="text-gray-600 mb-4">Depending on your location, you may have the right to:</p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to processing of your data</li>
              <li>Data portability</li>
            </ul>
            <p className="text-gray-600 mb-4">
              To exercise these rights, please contact your institution&apos;s administrator.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">8. Children&apos;s Privacy</h2>
            <p className="text-gray-600 mb-4">
              Code Classroom is designed for educational use and may be used by students of
              various ages under the supervision of their educational institution. We do not
              knowingly collect personal information from children under 13 without parental
              consent or the consent of an educational institution acting in loco parentis.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">9. Cookies and Tracking</h2>
            <p className="text-gray-600 mb-4">
              We use essential cookies to maintain your session and authentication state. These
              cookies are necessary for the Service to function and cannot be disabled. We do
              not use tracking cookies for advertising purposes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">10. Changes to This Policy</h2>
            <p className="text-gray-600 mb-4">
              We may update this Privacy Policy from time to time. We will notify users of any
              material changes by posting the new Privacy Policy on this page and updating the
              &quot;Last updated&quot; date.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">11. Contact Us</h2>
            <p className="text-gray-600 mb-4">
              If you have questions about this Privacy Policy or our data practices, please
              contact your institution&apos;s administrator or the platform administrators.
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
