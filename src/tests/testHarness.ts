type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const tests: TestCase[] = [];

export function test(name: string, run: TestCase["run"]): void {
  tests.push({ name, run });
}

export async function runTests(): Promise<void> {
  let passed = 0;

  for (const testCase of tests) {
    try {
      await testCase.run();
      passed += 1;
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      console.error(`FAIL ${testCase.name}`);
      console.error(error instanceof Error ? error.stack ?? error.message : error);
      process.exitCode = 1;
      return;
    }
  }

  console.log(`Unit tests passed: ${passed}`);
}
