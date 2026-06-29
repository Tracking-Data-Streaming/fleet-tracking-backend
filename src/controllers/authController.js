const {
    CognitoIdentityProviderClient,
    AdminInitiateAuthCommand,
    SignUpCommand,
    ConfirmSignUpCommand,
    ResendConfirmationCodeCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;

exports.login = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email và mật khẩu là bắt buộc' });
    }

    try {
        const result = await client.send(new AdminInitiateAuthCommand({
            AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
            UserPoolId: USER_POOL_ID,
            ClientId: CLIENT_ID,
            AuthParameters: { USERNAME: email, PASSWORD: password },
        }));

        const auth = result.AuthenticationResult;
        return res.json({
            idToken: auth.IdToken,
            accessToken: auth.AccessToken,
            refreshToken: auth.RefreshToken,
            expiresIn: auth.ExpiresIn,
        });
    } catch (err) {
        const status = err.name === 'NotAuthorizedException' ? 401
            : err.name === 'UserNotConfirmedException' ? 403
            : err.name === 'UserNotFoundException' ? 404
            : 500;
        return res.status(status).json({ message: err.message, code: err.name });
    }
};

exports.register = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email và mật khẩu là bắt buộc' });
    }

    try {
        const result = await client.send(new SignUpCommand({
            ClientId: CLIENT_ID,
            Username: email,
            Password: password,
            UserAttributes: [{ Name: 'email', Value: email }],
        }));

        return res.json({
            userSub: result.UserSub,
            confirmed: result.UserConfirmed,
        });
    } catch (err) {
        const status = err.name === 'UsernameExistsException' ? 409 : 400;
        return res.status(status).json({ message: err.message, code: err.name });
    }
};

exports.confirmSignUp = async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) {
        return res.status(400).json({ message: 'Email và mã xác thực là bắt buộc' });
    }

    try {
        await client.send(new ConfirmSignUpCommand({
            ClientId: CLIENT_ID,
            Username: email,
            ConfirmationCode: code,
        }));
        return res.json({ message: 'Xác thực thành công' });
    } catch (err) {
        return res.status(400).json({ message: err.message, code: err.name });
    }
};

exports.resendCode = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: 'Email là bắt buộc' });
    }

    try {
        await client.send(new ResendConfirmationCodeCommand({
            ClientId: CLIENT_ID,
            Username: email,
        }));
        return res.json({ message: 'Đã gửi lại mã xác thực' });
    } catch (err) {
        return res.status(400).json({ message: err.message, code: err.name });
    }
};
