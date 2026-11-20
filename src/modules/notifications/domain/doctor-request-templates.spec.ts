import { NOTIFICATION_TEMPLATES } from './notification-templates';

describe('doctor request notification templates', () => {
  it('NewDoctorRequestForAdmin goes to the admin and names the requested doctor', () => {
    const template = NOTIFICATION_TEMPLATES.NewDoctorRequestForAdmin;
    const payload = { adminUserId: 'admin-1', doctorRequestId: 'req-1', doctorName: ' Dr Ahmed ', clinicName: null, specialty: 'Cardiology' };

    expect(template.extractUserId(payload)).toBe('admin-1');
    const rendered = template.render(payload);
    expect(rendered.body).toContain('Dr Ahmed');
    expect(rendered.data).toEqual({ doctorRequestId: 'req-1', doctorName: 'Dr Ahmed', clinicName: null, specialty: 'Cardiology' });
  });

  it('NewDoctorRequestForAdmin falls back to the clinic name, then to generic wording', () => {
    const template = NOTIFICATION_TEMPLATES.NewDoctorRequestForAdmin;
    expect(template.render({ clinicName: 'Nile Clinic' }).body).toContain('Nile Clinic');
    expect(template.render({}).body).not.toContain('"');
  });

  it('DoctorRequestStatusChanged goes to the patient with a status-specific title', () => {
    const template = NOTIFICATION_TEMPLATES.DoctorRequestStatusChanged;
    expect(template.extractUserId({ patientId: 'patient-1' })).toBe('patient-1');

    const titles = ['IN_REVIEW', 'DOCTOR_ADDED', 'REJECTED', 'PENDING'].map((status) => template.render({ status, doctorRequestId: 'req-1' }).title);
    expect(new Set(titles.slice(0, 3)).size).toBe(3);
    expect(template.render({ status: 'DOCTOR_ADDED', doctorRequestId: 'req-1' }).data).toEqual({ doctorRequestId: 'req-1', status: 'DOCTOR_ADDED' });
  });
});
