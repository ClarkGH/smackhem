import NullRenderer from './nullRenderer';
import StubClock from './stubClock';
import StubInput from './stubInput';
import type { PlatformServices } from '../web/webBootstrap';

const createStubPlatform = async (): Promise<PlatformServices> => ({
    renderer: new NullRenderer(),
    clock: new StubClock(),
    input: new StubInput(),
    getAspectRatio: () => 16 / 9,
});

export default createStubPlatform;
