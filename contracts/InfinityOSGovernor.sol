// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title InfinityOSGovernor
 * @notice Decentralized governance for the Trancendos ecosystem.
 * @dev STUB — Not deployed. Future phase of 2060 roadmap.
 *
 * Features:
 * - Community proposals with configurable thresholds
 * - Time-locked execution for safety
 * - Quorum-based voting (4% of total supply)
 * - Compatible with Snapshot.org for off-chain voting
 *
 * 2060 Standard: Sovereign Digital Governance
 * ISO 27001: A.5.1 — Information security policy (governance)
 */

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";

contract InfinityOSGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    /// @notice Proposal categories for the Trancendos ecosystem
    enum ProposalCategory {
        PLATFORM_UPGRADE,      // Core platform changes
        AGENT_POLICY,          // AI agent governance rules
        TREASURY_ALLOCATION,   // Resource allocation
        COMPLIANCE_UPDATE,     // Compliance framework changes
        MARKETPLACE_RULE,      // Marketplace governance
        COMMUNITY              // General community proposals
    }

    /// @notice Track proposal categories
    mapping(uint256 => ProposalCategory) public proposalCategories;

    /// @notice Emitted when a categorized proposal is created
    event CategorizedProposalCreated(
        uint256 indexed proposalId,
        ProposalCategory category,
        address proposer,
        string description
    );

    /**
     * @param _token Governance token (InfinityOSToken)
     * @param _timelock TimelockController for delayed execution
     */
    constructor(
        IVotes _token,
        TimelockController _timelock
    )
        Governor("InfinityOSGovernor")
        GovernorSettings(
            7200,   /* votingDelay: ~1 day at 12s blocks */
            50400,  /* votingPeriod: ~1 week */
            0       /* proposalThreshold: 0 tokens to propose (adjustable) */
        )
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(4) /* 4% quorum */
        GovernorTimelockControl(_timelock)
    {}

    /**
     * @notice Create a proposal with a category tag.
     * @param targets Contract addresses to call
     * @param values ETH values to send
     * @param calldatas Encoded function calls
     * @param description Human-readable description
     * @param category Proposal category
     */
    function proposeWithCategory(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        ProposalCategory category
    ) public returns (uint256) {
        uint256 proposalId = propose(targets, values, calldatas, description);
        proposalCategories[proposalId] = category;
        emit CategorizedProposalCreated(proposalId, category, msg.sender, description);
        return proposalId;
    }

    // ── Required Overrides ─────────────────────────────────

    function votingDelay()
        public view override(Governor, GovernorSettings) returns (uint256)
    {
        return super.votingDelay();
    }

    function votingPeriod()
        public view override(Governor, GovernorSettings) returns (uint256)
    {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber)
        public view override(Governor, GovernorVotesQuorumFraction) returns (uint256)
    {
        return super.quorum(blockNumber);
    }

    function state(uint256 proposalId)
        public view override(Governor, GovernorTimelockControl) returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function proposalNeedsQueuing(uint256 proposalId)
        public view override(Governor, GovernorTimelockControl) returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function proposalThreshold()
        public view override(Governor, GovernorSettings) returns (uint256)
    {
        return super.proposalThreshold();
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal view override(Governor, GovernorTimelockControl) returns (address)
    {
        return super._executor();
    }
}