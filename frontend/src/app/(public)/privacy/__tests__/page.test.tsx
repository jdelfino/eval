/**
 * Tests for Privacy Policy page
 *
 * Tests:
 * - Page renders with correct heading and content sections
 * - Navigation links are present and correct
 * - Key privacy sections are displayed
 * - Privacy-friendly assertions (no password references, named sub-processors, direct contact email)
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import PrivacyPolicyPage from '../page';

const CONTACT_EMAIL = 'jdelfino@gmail.com';

describe('Privacy Policy Page', () => {
  describe('Page Rendering', () => {
    it('renders the page title', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 1, name: /privacy policy/i })).toBeInTheDocument();
    });

    it('renders the last updated date', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByText(/last updated:/i)).toBeInTheDocument();
    });

    it('renders the Code Classroom logo link to home', () => {
      render(<PrivacyPolicyPage />);

      const allLinks = screen.getAllByRole('link');
      const homeLinks = allLinks.filter(link => link.getAttribute('href') === '/');
      expect(homeLinks.length).toBeGreaterThan(0);
    });
  });

  describe('Privacy Content Sections', () => {
    it('renders Introduction section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /1\. introduction/i })).toBeInTheDocument();
    });

    it('renders What We Don\'t Do section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /2\. what we don't do/i })).toBeInTheDocument();
    });

    it('renders Information We Collect section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /3\. information we collect/i })).toBeInTheDocument();
    });

    it('renders How We Use Your Information section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /4\. how we use your information/i })).toBeInTheDocument();
    });

    it('renders How We Share Information section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /5\. how we share information/i })).toBeInTheDocument();
    });

    it('renders Data Security section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /6\. data security/i })).toBeInTheDocument();
    });

    it('renders Data Retention section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /7\. data retention/i })).toBeInTheDocument();
    });

    it('renders Your Rights section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /8\. your rights/i })).toBeInTheDocument();
    });

    it('renders Children\'s Privacy section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /9\. children's privacy/i })).toBeInTheDocument();
    });

    it('renders Cookies section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /10\. cookies/i })).toBeInTheDocument();
    });

    it('renders Changes to This Policy section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /11\. changes to this policy/i })).toBeInTheDocument();
    });

    it('renders Contact Us section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /12\. contact us/i })).toBeInTheDocument();
    });
  });

  describe('Sub-sections', () => {
    it('renders Account Information sub-section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 3, name: /account information/i })).toBeInTheDocument();
    });

    it('renders Educational Data sub-section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 3, name: /educational data/i })).toBeInTheDocument();
    });

    it('renders Server Logs sub-section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 3, name: /server logs/i })).toBeInTheDocument();
    });

    it('renders Within Your Class sub-section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 3, name: /within your class/i })).toBeInTheDocument();
    });

    it('renders Infrastructure Providers sub-section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 3, name: /infrastructure providers/i })).toBeInTheDocument();
    });

    it('renders Legal Requirements sub-section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 3, name: /legal requirements/i })).toBeInTheDocument();
    });
  });

  describe('Navigation Links', () => {
    it('renders Back to Home link', () => {
      render(<PrivacyPolicyPage />);

      const homeLink = screen.getByRole('link', { name: /back to home/i });
      expect(homeLink).toHaveAttribute('href', '/');
    });

    it('renders Terms of Service link', () => {
      render(<PrivacyPolicyPage />);

      const termsLink = screen.getByRole('link', { name: /terms of service/i });
      expect(termsLink).toHaveAttribute('href', '/terms');
    });
  });

  describe('Privacy-friendly content', () => {
    it('does not reference passwords (password login is internal-only)', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.queryByText(/password/i)).not.toBeInTheDocument();
    });

    it('names Google Cloud Platform as an infrastructure provider', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByText(/Google Cloud Platform/)).toBeInTheDocument();
    });

    it('names Firebase Authentication as an infrastructure provider', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByText(/Firebase Authentication/)).toBeInTheDocument();
    });

    it('explicitly states no third-party analytics', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getAllByText(/third-party analytics/i).length).toBeGreaterThan(0);
    });

    it('explicitly states data is not sold, rented, or traded', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByText(/don't sell, rent, or trade your data/i)).toBeInTheDocument();
    });

    it('describes Centrifugo as self-hosted (real-time stays in GCP perimeter)', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByText(/Centrifugo/)).toBeInTheDocument();
      expect(screen.getByText(/does not leave the Google Cloud perimeter/i)).toBeInTheDocument();
    });

    it('mentions one session cookie (not generic "essential cookies")', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByText(/one session cookie/i)).toBeInTheDocument();
    });

    it('does not direct users to an institution administrator', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.queryByText(/institution's administrator/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/institution administrator/i)).not.toBeInTheDocument();
    });

    it('provides the site administrator contact email for privacy requests', () => {
      render(<PrivacyPolicyPage />);

      const emailLinks = screen.getAllByRole('link', { name: CONTACT_EMAIL });
      expect(emailLinks.length).toBeGreaterThan(0);
      emailLinks.forEach(link => {
        expect(link).toHaveAttribute('href', `mailto:${CONTACT_EMAIL}`);
      });
    });
  });

  describe('Content Details', () => {
    it('mentions Code Classroom as the service', () => {
      render(<PrivacyPolicyPage />);

      const elements = screen.getAllByText(/code classroom/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    it('mentions email address collection', () => {
      render(<PrivacyPolicyPage />);

      const elements = screen.getAllByText(/email address/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    it('mentions code submissions collection', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByText(/code submissions and revisions/i)).toBeInTheDocument();
    });

    it('mentions HTTPS encryption for data in transit', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByText(/encrypted in transit/i)).toBeInTheDocument();
    });
  });
});
