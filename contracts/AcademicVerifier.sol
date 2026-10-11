// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AcademicVerifier
 * @dev Kontrak verifikasi ijazah berbasis peran untuk konsorsium perguruan tinggi.
 */
contract AcademicVerifier is AccessControl {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    struct Credential {
        bytes32 docHash;
        address studentWallet;
        uint256 issueTimestamp;
        bool isValid;
    }

    mapping(bytes32 => Credential) public credentials;

    event CredentialIssued(bytes32 indexed docHash, address indexed student);
    event CredentialRevoked(bytes32 indexed docHash);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ISSUER_ROLE, msg.sender);
    }

    function issueCredential(bytes32 _docHash, address _student) external onlyRole(ISSUER_ROLE) {
        require(credentials[_docHash].docHash == bytes32(0), "Kredensial sudah terdaftar");
        credentials[_docHash] = Credential(_docHash, _student, block.timestamp, true);
        emit CredentialIssued(_docHash, _student);
    }

    function verifyCredential(bytes32 _docHash) external view returns (bool) {
        return credentials[_docHash].isValid;
    }

    function revokeCredential(bytes32 _docHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(credentials[_docHash].docHash != bytes32(0), "Kredensial tidak ditemukan");
        credentials[_docHash].isValid = false;
        emit CredentialRevoked(_docHash);
    }
}