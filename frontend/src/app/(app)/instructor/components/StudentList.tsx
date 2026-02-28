'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Student } from '../types';

interface StudentListProps {
  students: Student[];
  onSelectStudent: (studentId: string) => void;
  onShowOnPublicView?: (studentId: string) => void;

  onViewHistory?: (studentId: string, studentName: string) => void;
  join_code?: string;
  isLoading?: boolean;
  featured_student_id?: string | null;
  headerLabel?: string;
}

export default function StudentList({ students, onSelectStudent, onShowOnPublicView, onViewHistory, join_code, isLoading = false, featured_student_id, headerLabel }: StudentListProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card variant="default" className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 m-0">{headerLabel || 'Connected Students'} ({students.length})</h3>
      </div>
      {isLoading ? (
        <div className="text-gray-500 py-4">
          <p className="m-0">Loading students...</p>
        </div>
      ) : students.length === 0 ? (
        <div className="bg-gray-50 p-4 mt-2">
          <p className="text-gray-500 mb-2">
            Waiting for students to join the session.
          </p>
          {join_code && (
            <p className="text-gray-700 m-0">
              Share this join code with your students:{' '}
              <span className="font-mono font-bold bg-gray-200 px-2 py-1 rounded text-blue-600">
                {join_code}
              </span>
            </p>
          )}
          {!join_code && (
            <p className="text-gray-400 text-sm m-0">
              Students can join using the session join code displayed in the session controls.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {students.map((student) => {
            const isFeatured = featured_student_id === student.id;
            return (
              <div
                key={student.id}
                data-testid={`student-row-${student.id}`}
                className={`p-3 border rounded flex flex-col gap-2 ${
                  isFeatured
                    ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                    : `border-gray-200 ${student.has_code ? 'bg-blue-50' : 'bg-white'}`
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-semibold text-gray-900 truncate">{student.name}</span>
                  {isFeatured && (
                    <Badge variant="success" className="shrink-0">
                      Featured
                    </Badge>
                  )}
                  {(() => {
                    if (!student.has_code) {
                      return <Badge variant="default" className="shrink-0">Not started</Badge>;
                    }
                    const isActive = student.last_code_update && (now - student.last_code_update.getTime() < 30_000);
                    if (isActive) {
                      return <Badge variant="success" className="shrink-0">Active</Badge>;
                    }
                    return <Badge variant="warning" className="shrink-0">Inactive</Badge>;
                  })()}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onSelectStudent(student.id)}
                    title="View student's code"
                    className="from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700"
                  >
                    View
                  </Button>
                  {onViewHistory && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onViewHistory(student.id, student.name)}
                      title="View code revision history"
                      className="from-purple-600 to-purple-600 hover:from-purple-700 hover:to-purple-700"
                    >
                      History
                    </Button>
                  )}
                  {onShowOnPublicView && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onShowOnPublicView(student.id)}
                      title="Display this submission on the public view"
                      className="from-emerald-500 to-emerald-500 hover:from-emerald-600 hover:to-emerald-600"
                    >
                      Feature
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
