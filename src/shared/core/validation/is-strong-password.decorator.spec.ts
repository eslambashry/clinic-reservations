import { validate } from 'class-validator';
import { IsStrongPassword } from './is-strong-password.decorator';

class TestDto {
  @IsStrongPassword()
  password!: string;
}

async function validatePassword(password: unknown) {
  const dto = new TestDto();
  dto.password = password as string;
  const errors = await validate(dto);
  return errors;
}

describe('IsStrongPassword', () => {
  it('accepts a password meeting every rule (8-64 chars, upper, lower, digit, symbol)', async () => {
    const errors = await validatePassword('NewPass1!');
    expect(errors).toHaveLength(0);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const errors = await validatePassword('Ab1!xyz');

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toMatchObject({ isStrongPassword: expect.any(String) });
  });

  it('rejects a password longer than 64 characters', async () => {
    const tooLong = `Ab1!${'x'.repeat(61)}`; // 65 chars total
    expect(tooLong).toHaveLength(65);

    const errors = await validatePassword(tooLong);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toMatchObject({ isStrongPassword: expect.any(String) });
  });

  it('rejects a password missing an uppercase letter', async () => {
    const errors = await validatePassword('newpass1!');

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toMatchObject({ isStrongPassword: expect.any(String) });
  });

  it('rejects a password missing a lowercase letter', async () => {
    const errors = await validatePassword('NEWPASS1!');

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toMatchObject({ isStrongPassword: expect.any(String) });
  });

  it('rejects a password missing a digit', async () => {
    const errors = await validatePassword('NewPassword!');

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toMatchObject({ isStrongPassword: expect.any(String) });
  });

  it('rejects a password missing a symbol', async () => {
    const errors = await validatePassword('NewPass123');

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toMatchObject({ isStrongPassword: expect.any(String) });
  });

  it('rejects a non-string value', async () => {
    const errors = await validatePassword(12345678);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toMatchObject({ isStrongPassword: expect.any(String) });
  });
});
