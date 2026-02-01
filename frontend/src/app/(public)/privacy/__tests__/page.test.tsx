/**
 * Tests for Privacy Policy page
 *
 * Tests:
 * - Page renders with correct heading and content sections
 * - Navigation links are present and correct
 * - Key privacy sections are displayed
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import PrivacyPolicyPage from '../page';

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

    it('renders Information We Collect section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /2\. information we collect/i })).toBeInTheDocument();
    });

    it('renders How We Use Your Information section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /3\. how we use your information/i })).toBeInTheDocument();
    });

    it('renders Information Sharing section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /4\. information sharing/i })).toBeInTheDocument();
    });

    it('renders Data Security section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /5\. data security/i })).toBeInTheDocument();
    });

    it('renders Data Retention section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /6\. data retention/i })).toBeInTheDocument();
    });

    it('renders Your Rights section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /7\. your rights/i })).toBeInTheDocument();
    });

    it('renders Children\'s Privacy section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /8\. children's privacy/i })).toBeInTheDocument();
    });

    it('renders Cookies and Tracking section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /9\. cookies and tracking/i })).toBeInTheDocument();
    });

    it('renders Changes to This Policy section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /10\. changes to this policy/i })).toBeInTheDocument();
    });

    it('renders Contact Us section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 2, name: /11\. contact us/i })).toBeInTheDocument();
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

    it('renders Usage Data sub-section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 3, name: /usage data/i })).toBeInTheDocument();
    });

    it('renders Within Educational Context sub-section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 3, name: /within educational context/i })).toBeInTheDocument();
    });

    it('renders Service Providers sub-section', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByRole('heading', { level: 3, name: /service providers/i })).toBeInTheDocument();
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

  describe('Content Details', () => {
    it('mentions Code Classroom as the service', () => {
      render(<PrivacyPolicyPage />);

      // Multiple mentions of Code Classroom in the document
      const elements = screen.getAllByText(/code classroom/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    it('describes commitment to protecting privacy', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByText(/committed to protecting your privacy/i)).toBeInTheDocument();
    });

    it('mentions email address collection', () => {
      render(<PrivacyPolicyPage />);

      // Multiple mentions of email address
      const elements = screen.getAllByText(/email address/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    it('mentions code submissions collection', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByText(/code submissions and revisions/i)).toBeInTheDocument();
    });

    it('mentions encryption for data security', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByText(/encryption of data in transit/i)).toBeInTheDocument();
    });

    it('mentions essential cookies usage', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByText(/essential cookies/i)).toBeInTheDocument();
    });

    it('does not mention advertising tracking', () => {
      render(<PrivacyPolicyPage />);

      expect(screen.getByText(/do not use tracking cookies for advertising/i)).toBeInTheDocument();
    });
  });
});
