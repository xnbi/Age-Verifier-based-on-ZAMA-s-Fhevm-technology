// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import {FHE, euint32} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title AgeCredentialNFT (Simplified Version)
 * @notice FHE-based age verification credential NFT
 * @dev Simplified version to avoid "stack too deep" errors
 */
contract AgeCredentialNFT is ERC721, Ownable, SepoliaConfig {
    using FHE for *;

    uint256 private _tokenIdCounter;
    
    // Store encrypted ages
    mapping(uint256 => euint32) private encryptedAges;
    
    // Address to Token ID mapping
    mapping(address => uint256) public addressToTokenId;
    
    // Mint timestamp
    mapping(uint256 => uint256) public mintTimestamp;
    
    // Authorized minters
    mapping(address => bool) public authorizedMinters;

    event CredentialMinted(address indexed to, uint256 indexed tokenId, uint256 timestamp);
    event MinterAuthorized(address indexed minter);

    constructor() ERC721("Age Credential", "AGE") Ownable(msg.sender) {
        _tokenIdCounter = 1;
    }

    function authorizeMinter(address minter) external onlyOwner {
        authorizedMinters[minter] = true;
        emit MinterAuthorized(minter);
    }

    function mintCredential(address to, euint32 encryptedAge) external returns (uint256) {
        require(authorizedMinters[msg.sender], "Not authorized");
        require(addressToTokenId[to] == 0, "Already has credential");

        uint256 tokenId = _tokenIdCounter++;
        
        _safeMint(to, tokenId);
        
        encryptedAges[tokenId] = encryptedAge;
        addressToTokenId[to] = tokenId;
        mintTimestamp[tokenId] = block.timestamp;

        emit CredentialMinted(to, tokenId, block.timestamp);
        
        return tokenId;
    }

    function hasCredential(address account) external view returns (bool) {
        return addressToTokenId[account] != 0;
    }

    function getTokenIdOf(address account) external view returns (uint256) {
        return addressToTokenId[account];
    }

    function getEncryptedAge(uint256 tokenId) external view returns (euint32) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return encryptedAges[tokenId];
    }

    // Base URI for NFT metadata (set to IPFS gateway or your server)
    string private baseImageURI = "ipfs://bafkreibocdclhsdq4tmlticlp6hekn5kztvuttxcihnwdanshiexg5o5qi";
    
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        
        // Build metadata with IPFS image
        string memory json = string(
            abi.encodePacked(
                '{"name":"Age Credential #', _toString(tokenId), '",',
                '"description":"Privacy-preserving proof of age verification using Zama FHEVM. This credential certifies that the holder is 18 years or older without revealing their actual age.",',
                '"image":"', baseImageURI, '",',
                '"external_url":"https://github.com/xyiy001/fhevm-age-verifier",',
                '"attributes":[',
                    '{"trait_type":"Verified","value":"Yes"},',
                    '{"trait_type":"Type","value":"Soulbound"},',
                    '{"trait_type":"Network","value":"Sepolia"},',
                    '{"trait_type":"Technology","value":"FHEVM"}',
                ']}'
            )
        );
        
        // Return as base64 encoded data URI
        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(bytes(json))
            )
        );
    }
    
    // Owner can update base image URI if needed
    function setBaseImageURI(string memory newBaseURI) external onlyOwner {
        baseImageURI = newBaseURI;
    }

    // Soulbound: prevent transfers
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        
        if (from != address(0) && to != address(0)) {
            revert("Soulbound: cannot transfer");
        }
        
        return super._update(to, tokenId, auth);
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}

